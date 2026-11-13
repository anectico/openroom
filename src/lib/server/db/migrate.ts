import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { requireDiskSpace } from '../disk-space.ts';
import { appVersion, dbPath, migrationsDir, snapshotDir } from '../paths.ts';
import { openSqlite, type Sqlite } from './connection.ts';

export type Migration = { tag: string; hash: string; statements: string[] };

export class MigrationError extends Error {}

export function readJournal(dir = migrationsDir): Migration[] {
	const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as {
		entries: { idx: number; tag: string }[];
	};
	return journal.entries
		.sort((a, b) => a.idx - b.idx)
		.map(({ tag }) => {
			const sql = readFileSync(join(dir, `${tag}.sql`), 'utf8');
			return {
				tag,
				hash: createHash('sha256').update(sql).digest('hex'),
				statements: sql
					.split('--> statement-breakpoint')
					.map((s) => s.trim())
					.filter(Boolean),
			};
		});
}

function ensureBookkeeping(db: Sqlite) {
	db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
		tag TEXT PRIMARY KEY,
		hash TEXT NOT NULL,
		applied_at INTEGER NOT NULL
	)`);
	db.exec(`CREATE TABLE IF NOT EXISTS _snapshots (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		path TEXT NOT NULL,
		before_tag TEXT NOT NULL,
		image_version TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`);
}

export function appliedMigrations(db: Sqlite) {
	ensureBookkeeping(db);
	return db.prepare('SELECT tag, hash FROM _migrations ORDER BY rowid').all() as {
		tag: string;
		hash: string;
	}[];
}

export function planMigrations(applied: { tag: string; hash: string }[], known: Migration[]) {
	const knownByTag = new Map(known.map((m) => [m.tag, m]));
	const appliedTags = new Set(applied.map((a) => a.tag));
	for (const a of applied) {
		const m = knownByTag.get(a.tag);
		if (!m) {
			throw new MigrationError(
				`The database has migration ${a.tag}, which this version of OpenRoom does not know. ` +
					'An older image was started on a newer database. Run `openroom-server rollback` to go back properly, or update again.',
			);
		}
		if (m.hash !== a.hash) {
			throw new MigrationError(
				`Migration ${a.tag} was changed after it was applied. Applied migrations must never be edited.`,
			);
		}
	}
	const lastApplied = known.findLastIndex((m) => appliedTags.has(m.tag));
	const skipped = known.slice(0, lastApplied + 1).filter((m) => !appliedTags.has(m.tag));
	if (skipped.length) {
		throw new MigrationError(`Migration ${skipped[0].tag} was never applied, but later ones were.`);
	}
	return known.slice(lastApplied + 1);
}

function check(db: Sqlite, when: string) {
	const integrity = db.pragma('integrity_check', { simple: true });
	if (integrity !== 'ok') throw new MigrationError(`Integrity check failed ${when}: ${integrity}`);
	const fk = db.pragma('foreign_key_check') as unknown[];
	if (fk.length)
		throw new MigrationError(`Foreign key check failed ${when}: ${JSON.stringify(fk.slice(0, 5))}`);
}

function currentSnapshot(db: Sqlite) {
	return db
		.prepare('SELECT path, before_tag, image_version FROM _snapshots ORDER BY id DESC LIMIT 1')
		.get() as { path: string; before_tag: string; image_version: string } | undefined;
}

function takeSnapshot(db: Sqlite, beforeTag: string, applied: Set<string>) {
	const existing = currentSnapshot(db);
	if (
		existing &&
		existing.image_version === appVersion &&
		applied.has(existing.before_tag) &&
		existsSync(existing.path)
	) {
		return existing.path;
	}
	mkdirSync(snapshotDir, { recursive: true });
	const now = Date.now();
	const path = join(
		snapshotDir,
		`${new Date(now).toISOString().replace(/[:.]/g, '-')}-before-${beforeTag}.db`,
	);
	const size =
		Number(db.pragma('page_count', { simple: true })) * Number(db.pragma('page_size', { simple: true }));
	requireDiskSpace(size);
	db.prepare('VACUUM INTO ?').run(path);
	db.prepare('DELETE FROM _snapshots').run();
	db.prepare('INSERT INTO _snapshots (path, before_tag, image_version, created_at) VALUES (?, ?, ?, ?)').run(
		path,
		beforeTag,
		appVersion,
		now,
	);
	return path;
}

function removeOtherSnapshots(keep: string | null) {
	if (!keep || !existsSync(snapshotDir)) return;
	for (const name of readdirSync(snapshotDir)) {
		const file = join(snapshotDir, name);
		if (file !== keep) rmSync(file, { force: true });
	}
}

export function migrate(path = dbPath, dir = migrationsDir) {
	const known = readJournal(dir);
	const fresh = !existsSync(path);
	const db = openSqlite(path, { foreignKeys: false });
	try {
		const applied = appliedMigrations(db);
		const pending = planMigrations(applied, known);
		if (!pending.length) return { applied: [] as string[], snapshot: null as string | null };
		check(db, 'before migrating');
		const snapshot =
			fresh || applied.length === 0
				? null
				: takeSnapshot(db, pending[0].tag, new Set(applied.map((a) => a.tag)));
		for (const m of pending) {
			db.transaction(() => {
				for (const statement of m.statements) db.exec(statement);
				const fk = db.pragma('foreign_key_check') as unknown[];
				if (fk.length)
					throw new MigrationError(
						`Migration ${m.tag} broke foreign keys: ${JSON.stringify(fk.slice(0, 5))}`,
					);
				db.prepare('INSERT INTO _migrations (tag, hash, applied_at) VALUES (?, ?, ?)').run(
					m.tag,
					m.hash,
					Date.now(),
				);
			})();
		}
		check(db, 'after migrating');
		removeOtherSnapshots(snapshot);
		return { applied: pending.map((m) => m.tag), snapshot };
	} finally {
		db.close();
	}
}
