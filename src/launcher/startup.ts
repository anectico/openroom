import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openSqlite } from '../lib/server/db/connection.ts';
import { readJournal } from '../lib/server/db/migrate.ts';
import { dbDir, dbPath, rollbackMarkerPath } from '../lib/server/paths.ts';
import { s3Config, s3FromEnv } from '../lib/server/s3.ts';
import { checkSavedSecrets, checkStoredFiles } from './file-check.ts';
import {
	appendPrefix,
	litestreamConfigPath,
	litestreamEnv,
	prefixFor,
	readPrefixes,
	replicaRoot,
	writeLitestreamConfig,
} from './replica.ts';

export const litestreamBin = process.env.LITESTREAM_BIN ?? 'litestream';

export class StartupError extends Error {}

function run(args: string[], config: ReturnType<typeof s3FromEnv> = null) {
	const result = spawnSync(litestreamBin, args, { stdio: 'inherit', env: litestreamEnv(config) });
	if (result.error) throw new StartupError(`Could not run Litestream: ${result.error.message}`);
	return result.status ?? 1;
}

export async function restoreIfRequested() {
	const from = process.env.RESTORE_FROM;
	if (!from) return false;
	if (existsSync(dbPath)) {
		console.log('RESTORE_FROM is set but a database already exists; restore skipped.');
		return false;
	}
	const rawAt = process.env.RESTORE_AT?.trim();
	if (rawAt && !/(Z|[+-]\d{2}:?\d{2})$/i.test(rawAt))
		throw new StartupError(`RESTORE_AT needs a time zone, such as 2026-11-08T10:00:00Z: ${rawAt}`);
	const at = rawAt ? new Date(rawAt) : null;
	if (at && Number.isNaN(at.getTime())) throw new StartupError(`RESTORE_AT is not a valid time: ${rawAt}`);
	const config = s3FromEnv();
	if (!process.env.OPENROOM_SECRET_KEY)
		throw new StartupError('Restore needs the old OPENROOM_SECRET_KEY before the first start.');
	const entry = await prefixFor(at, from, config);
	if (!entry)
		throw new StartupError(`No replica found at ${from} (no CURRENT file). Nothing was restored or created.`);
	mkdirSync(dbDir, { recursive: true });
	const staging = `${dbPath}.restoring`;
	rmSync(staging, { force: true });
	writeLitestreamConfig(entry.prefix, from, config);
	const args = ['restore', '-if-db-not-exists', '-config', litestreamConfigPath, '-o', staging];
	if (at) args.push('-timestamp', at.toISOString());
	args.push(dbPath);
	console.log(`Restoring from ${from} prefix ${entry.prefix}${at ? ` at ${at.toISOString()}` : ''}`);
	if (run(args, config) !== 0 || !existsSync(staging)) {
		rmSync(staging, { force: true });
		throw new StartupError(
			`Restore from ${from} failed. Nothing was created; check RESTORE_FROM and the keys.`,
		);
	}
	try {
		const restored = openSqlite(staging, { readonly: true });
		try {
			if (
				restored.pragma('integrity_check', { simple: true }) !== 'ok' ||
				(restored.pragma('foreign_key_check') as unknown[]).length
			)
				throw new StartupError('The restored database failed its integrity check.');
			checkSavedSecrets(restored);
			await checkStoredFiles(restored, config);
		} finally {
			restored.close();
		}
		const localState = openSqlite(staging);
		try {
			if (tableExists(localState, '_snapshots')) localState.prepare('DELETE FROM _snapshots').run();
		} finally {
			localState.close();
		}
		await appendPrefix('restore', replicaRoot(config), config);
		renameSync(staging, dbPath);
	} catch (error) {
		rmSync(staging, { force: true });
		throw error;
	}
	return true;
}

type Marker = { snapshot: string; prepared?: { replaced: string; prefix: string; root: string } };

function tableExists(db: Database.Database, name: string) {
	return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

function sharedColumns(db: Database.Database, table: string) {
	const cols = (schema: string) =>
		(db.prepare(`SELECT name FROM ${schema}.pragma_table_info(?)`).all(table) as { name: string }[]).map(
			(c) => c.name,
		);
	const live = new Set(cols('live'));
	return cols('main').filter((c) => live.has(c));
}

function carryLiveState(livePath: string, snapshotPath: string) {
	if (!existsSync(livePath)) return;
	const snap = openSqlite(snapshotPath);
	try {
		snap.prepare('ATTACH DATABASE ? AS live').run(livePath);
		const live = (name: string) =>
			!!snap.prepare("SELECT 1 FROM live.sqlite_master WHERE type = 'table' AND name = ?").get(name);
		snap.transaction(() => {
			if (tableExists(snap, 'settings') && live('settings')) {
				const cols = sharedColumns(snap, 'settings').map((c) => `"${c}"`);
				if (cols.includes('"key"')) {
					snap.exec("DELETE FROM main.settings WHERE key LIKE 'storage.%' OR key LIKE 'replication.%'");
					snap.exec(
						`INSERT OR REPLACE INTO main.settings (${cols.join(', ')}) SELECT ${cols.join(', ')} FROM live.settings WHERE key LIKE 'storage.%' OR key LIKE 'replication.%'`,
					);
				}
			}
			if (tableExists(snap, 'objects') && live('objects')) {
				snap.exec(
					'UPDATE main.objects SET location = (SELECT l.location FROM live.objects l WHERE l.key = main.objects.key) WHERE key IN (SELECT key FROM live.objects)',
				);
			}
		})();
		snap.exec('DETACH DATABASE live');
	} catch (error) {
		throw new StartupError(
			`Rollback stopped before changing anything: carrying settings into the snapshot failed (${error instanceof Error ? error.message : error}). Run openroom-server cancel-rollback to start on the current database.`,
		);
	} finally {
		snap.close();
	}
}

function liveHasUnknownMigrations() {
	if (!existsSync(dbPath)) return false;
	const db = openSqlite(dbPath, { readonly: true });
	try {
		if (!tableExists(db, '_migrations')) return false;
		const known = new Set(readJournal().map((m) => m.tag));
		return (db.prepare('SELECT tag FROM _migrations').all() as { tag: string }[]).some(
			(r) => !known.has(r.tag),
		);
	} finally {
		db.close();
	}
}

async function inspectRollback(path: string) {
	const restored = openSqlite(path, { readonly: true });
	try {
		if (
			restored.pragma('integrity_check', { simple: true }) !== 'ok' ||
			(restored.pragma('foreign_key_check') as unknown[]).length
		)
			throw new StartupError('The rollback database failed its integrity check. The app was not started.');
		checkSavedSecrets(restored);
		const config = s3Config(restored);
		await checkStoredFiles(restored, config);
		return config;
	} finally {
		restored.close();
	}
}

export async function rollbackIfMarked() {
	if (!existsSync(rollbackMarkerPath)) return false;
	const marker = JSON.parse(readFileSync(rollbackMarkerPath, 'utf8')) as Marker;
	const staged = join(dbDir, 'rollback-staged.db');
	if (!marker.prepared) {
		if (!liveHasUnknownMigrations()) {
			rmSync(rollbackMarkerPath);
			console.log(
				'A rollback marker was found, but this version can run the current database; the marker was removed and nothing was swapped.',
			);
			return false;
		}
		if (!existsSync(marker.snapshot))
			throw new StartupError(`Rollback snapshot is missing: ${marker.snapshot}`);
		for (const suffix of ['', '-wal', '-shm']) rmSync(staged + suffix, { force: true });
		copyFileSync(marker.snapshot, staged);
		let config: ReturnType<typeof s3Config>;
		try {
			carryLiveState(dbPath, staged);
			config = await inspectRollback(staged);
		} catch (error) {
			rmSync(staged, { force: true });
			throw error;
		}
		const root = replicaRoot(config);
		const entry = await appendPrefix('rollback', root, config);
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		marker.prepared = { replaced: join(dbDir, `replaced-${stamp}.db`), prefix: entry.prefix, root };
		const temporary = `${rollbackMarkerPath}.tmp`;
		writeFileSync(temporary, JSON.stringify(marker), { mode: 0o600, flush: true });
		renameSync(temporary, rollbackMarkerPath);
	}
	const config = await inspectRollback(existsSync(staged) ? staged : dbPath);
	const root = replicaRoot(config);
	if (
		root !== marker.prepared.root ||
		(await readPrefixes(root, config)).at(-1)?.prefix !== marker.prepared.prefix
	)
		throw new StartupError(
			'The replica prefix changed during rollback. Keep the server stopped and inspect CURRENT before continuing.',
		);
	if (existsSync(staged)) {
		for (const suffix of ['', '-wal', '-shm']) {
			if (!existsSync(dbPath + suffix)) continue;
			if (existsSync(marker.prepared.replaced + suffix))
				throw new StartupError(
					'The replaced database already exists. Rollback stopped without overwriting it.',
				);
			renameSync(dbPath + suffix, marker.prepared.replaced + suffix);
		}
		renameSync(staged, dbPath);
	}
	writeLitestreamConfig(marker.prepared.prefix, root, config);
	if (run(['reset', '-config', litestreamConfigPath, dbPath], config) !== 0)
		throw new StartupError(
			'Litestream reset failed after the rollback swap. Restart to finish the pending rollback; its prefix and replaced database were kept.',
		);
	rmSync(rollbackMarkerPath);
	console.log(
		`Rolled back to ${marker.snapshot}; the replaced database is kept at ${marker.prepared.replaced}.`,
	);
	return true;
}
