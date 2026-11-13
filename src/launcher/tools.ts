import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openSqlite } from '../lib/server/db/connection.ts';
import { dataDir, dbPath, rollbackMarkerPath } from '../lib/server/paths.ts';
import { s3Config } from '../lib/server/s3.ts';
import { checkSavedSecrets, checkStoredFiles } from './file-check.ts';
import { probeReplication } from './health.ts';
import { readPrefixes, replicaRoot } from './replica.ts';

type Check = { name: string; ok: boolean; detail: string; fix?: string };

function openReadonly() {
	if (!existsSync(dbPath)) return null;
	return openSqlite(dbPath, { readonly: true });
}

function latestFile(dir: string): number | null {
	if (!existsSync(dir)) return null;
	let latest: number | null = null;
	for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile()) continue;
		const t = statSync(join(entry.parentPath, entry.name)).mtimeMs;
		if (latest === null || t > latest) latest = t;
	}
	return latest;
}

async function doctor() {
	const checks: Check[] = [];
	const db = openReadonly();
	const storage = db ? s3Config(db) : null;
	if (!db) {
		checks.push({
			name: 'database',
			ok: false,
			detail: `No database at ${dbPath}`,
			fix: 'Start the app once.',
		});
	} else {
		const quick = db.pragma('quick_check', { simple: true });
		checks.push({ name: 'database', ok: quick === 'ok', detail: `quick_check: ${quick}` });
		const applied = db.prepare('SELECT tag FROM _migrations ORDER BY rowid').all() as { tag: string }[];
		checks.push({
			name: 'migrations',
			ok: true,
			detail: `${applied.length} applied, last ${applied.at(-1)?.tag ?? 'none'}`,
		});
		const snapshots = db.prepare('SELECT path, before_tag, image_version FROM _snapshots').all() as {
			path: string;
			before_tag: string;
			image_version: string;
		}[];
		checks.push({
			name: 'rollback snapshot',
			ok: snapshots.every((s) => existsSync(s.path)),
			detail: snapshots.length
				? snapshots.map((s) => `${s.path} (before ${s.before_tag}, taken by ${s.image_version})`).join('; ')
				: 'none yet (taken before the first update with migrations)',
		});
		db.close();
		const wal = existsSync(`${dbPath}-wal`) ? statSync(`${dbPath}-wal`).size : 0;
		checks.push({
			name: 'WAL size',
			ok: wal < 512 * 1024 * 1024,
			detail: `${(wal / 1024 / 1024).toFixed(1)} MB`,
			fix: 'A large WAL means Litestream is not checkpointing; check that replication runs.',
		});
	}
	const root = replicaRoot(storage);
	const prefixes = await readPrefixes(root, storage);
	const current = prefixes.at(-1);
	const last = current && root.startsWith('file://') ? latestFile(join(root.slice(7), current.prefix)) : null;
	const confirmed = await probeReplication();
	const ageMin = last ? (Date.now() - last) / 60_000 : null;
	checks.push({
		name: 'replication',
		ok: !!current && confirmed.ok,
		detail: current
			? `prefix ${current.prefix} at ${root}, ${confirmed.ok ? 'replication confirmed now' : (confirmed.error ?? 'replication not confirmed')}${ageMin === null ? '' : `, last local write ${ageMin.toFixed(0)} min ago`}`
			: `no replica at ${root}`,
		fix: 'Without S3 the replica sits on this server only; add S3 to survive losing the server.',
	});
	const fs = statfsSync(dataDir);
	const free = fs.bavail * fs.bsize;
	const total = fs.blocks * fs.bsize;
	checks.push({
		name: 'disk',
		ok: free / total > 0.1 && free > 2 * 1024 ** 3,
		detail: `${(free / 1024 ** 3).toFixed(1)} GB free of ${(total / 1024 ** 3).toFixed(1)} GB`,
		fix: 'Free space or move files to S3.',
	});
	checks.push({ name: 'litestream', ...litestreamVersion() });
	return checks;
}

function litestreamVersion() {
	const r = spawnSync(process.env.LITESTREAM_BIN ?? 'litestream', ['version'], { encoding: 'utf8' });
	return r.status === 0
		? { ok: true, detail: r.stdout.trim() }
		: { ok: false, detail: 'litestream not found' };
}

function rollbackPlan(previousJournalPath: string, apply: boolean) {
	const journal = JSON.parse(readFileSync(previousJournalPath === '-' ? 0 : previousJournalPath, 'utf8')) as {
		entries: { tag: string }[];
	};
	const known = new Set(journal.entries.map((e) => e.tag));
	const db = openReadonly();
	if (!db) throw new Error(`No database at ${dbPath}`);
	const requiresS3 = !!s3Config(db);
	const applied = (db.prepare('SELECT tag FROM _migrations ORDER BY rowid').all() as { tag: string }[]).map(
		(r) => r.tag,
	);
	const extra = applied.filter((t) => !known.has(t));
	if (!extra.length) {
		db.close();
		return {
			action: 'repin',
			requiresS3,
			detail: 'The previous version knows every applied migration; no data is discarded.',
		};
	}
	const snapshot = db.prepare('SELECT path, created_at FROM _snapshots WHERE before_tag = ?').get(extra[0]) as
		| { path: string; created_at: number }
		| undefined;
	db.close();
	if (!snapshot || !existsSync(snapshot.path)) {
		throw new Error(`No snapshot taken before ${extra[0]}; cannot roll back the database safely.`);
	}
	if (apply) writeFileSync(rollbackMarkerPath, JSON.stringify({ snapshot: snapshot.path }));
	const ageDays = (Date.now() - snapshot.created_at) / 86_400_000;
	return {
		action: 'swap',
		requiresS3,
		snapshot: snapshot.path,
		takenAt: new Date(snapshot.created_at).toISOString(),
		discards: extra,
		warning:
			ageDays > 30
				? `The snapshot is ${ageDays.toFixed(0)} days old, older than the 30-day retention window; files it refers to may be gone.`
				: undefined,
	};
}

const [command, arg] = process.argv.slice(2);
const json = process.argv.includes('--json');

try {
	if (command === 'capabilities') {
		console.log(JSON.stringify({ s3: true }));
	} else if (command === 'doctor') {
		const checks = await doctor();
		if (json) console.log(JSON.stringify(checks));
		else
			for (const c of checks)
				console.log(
					`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}${!c.ok && c.fix ? `\n     ${c.fix}` : ''}`,
				);
		process.exit(checks.every((c) => c.ok) ? 0 : 2);
	} else if (command === 'verify-restore') {
		const db = openReadonly();
		if (!db) throw new Error('No restored database was found.');
		try {
			checkSavedSecrets(db);
			const config = s3Config(db);
			await checkStoredFiles(db, config);
			if (config?.source === 'env') {
				for (const [key, expected] of [
					['access_key_id', config.accessKeyId],
					['secret_access_key', config.secretAccessKey],
				]) {
					const row = db.prepare('SELECT value_enc FROM settings WHERE key = ?').get(`storage.s3.${key}`) as
						| { value_enc: string }
						| undefined;
					const { decrypt } = await import('../lib/server/secrets.ts');
					if (!row || decrypt(row.value_enc) !== expected)
						throw new Error(
							'Restored S3 credentials were not saved. Keep the environment credentials and retry.',
						);
				}
			}
			console.log(JSON.stringify({ ok: true, secrets: 'decrypt', files: 'present', storage: 'saved' }));
		} finally {
			db.close();
		}
	} else if (command === 'rollback-plan') {
		console.log(JSON.stringify(rollbackPlan(arg ?? '-', process.argv.includes('--apply'))));
	} else if (command === 'reset-password') {
		const { resetPassword } = await import('./member-tools.ts');
		const r = await resetPassword(arg);
		if (json) console.log(JSON.stringify(r));
		else
			console.log(
				`Send this link to ${r.email}; it sets a new password and works once, until ${r.expiresAt}:\n${r.url}`,
			);
	} else if (command === 'create-api-key') {
		const { createKey } = await import('./member-tools.ts');
		const nameAt = process.argv.indexOf('--name');
		const r = await createKey(arg, nameAt > 0 ? process.argv[nameAt + 1] : 'Created on the server');
		if (json) console.log(JSON.stringify(r));
		else console.log(`API key for ${r.email} (${r.role}), shown only now:\n${r.key}\n\nREST: ${r.apiUrl}`);
	} else if (command === 'cancel-rollback') {
		if (existsSync(rollbackMarkerPath) && JSON.parse(readFileSync(rollbackMarkerPath, 'utf8')).prepared)
			throw new Error(
				'A database rollback has already begun. Restart to finish it; its replica prefix must not be discarded.',
			);
		rmSync(rollbackMarkerPath, { force: true });
		console.log(JSON.stringify({ cancelled: true }));
	} else {
		console.error(
			'Usage: tools.ts capabilities | doctor [--json] | verify-restore | rollback-plan <previous-journal.json|-> [--apply] | cancel-rollback | reset-password <email> | create-api-key <email> [--name NAME]',
		);
		process.exit(64);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
