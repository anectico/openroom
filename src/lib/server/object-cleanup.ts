import type { Disk } from 'flydrive';
import { database } from './db/index.ts';
import { s3Config, s3Connection } from './s3.ts';
import { getSetting } from './settings.ts';
import { storage } from './storage.ts';

export const objectRetentionMs = 30 * 86_400_000;

export async function* storedFiles(disk: Disk, prefix: string) {
	let paginationToken: string | undefined;
	do {
		const page = await disk.listAll(prefix, { recursive: true, paginationToken });
		for (const item of page.objects) if (item.isFile && item.key.startsWith(prefix)) yield item;
		paginationToken = page.paginationToken;
	} while (paginationToken);
}

function referenced(key: string) {
	const db = database().sqlite;
	return (
		getSetting('branding.logo_key') === key ||
		!!db
			.prepare(`SELECT 1 FROM file_versions WHERE object_key = ?
		UNION ALL SELECT 1 FROM file_request_uploads WHERE object_key = ?
		UNION ALL SELECT 1 FROM rooms WHERE logo_object_key = ? LIMIT 1`)
			.get(key, key, key)
	);
}

function known(key: string, now: number) {
	const db = database().sqlite;
	return (
		!!db.prepare('SELECT 1 FROM objects WHERE key = ?').get(key) ||
		!!db
			.prepare(
				'SELECT 1 FROM uploads WHERE object_key = ? AND (expires_at > ? OR in_progress_since IS NOT NULL)',
			)
			.get(key, now) ||
		referenced(key)
	);
}

export async function cleanupReleasedObjects(now = Date.now()) {
	if (getSetting('storage.move.id')) return;
	const db = database().sqlite;
	const config = s3Config();
	const rows = db
		.prepare('SELECT key FROM objects WHERE refcount = 0 AND released_at < ?')
		.all(now - objectRetentionMs) as { key: string }[];
	for (const { key } of rows) {
		if (getSetting('storage.move.id')) return;
		if (referenced(key)) continue;
		if (config) await s3Connection(config).disk.delete(key);
		await storage().delete(key);
		db.prepare('DELETE FROM objects WHERE key = ? AND refcount = 0 AND released_at < ?').run(
			key,
			now - objectRetentionMs,
		);
	}
}

export async function sweepStrayObjects(now = Date.now()) {
	if (getSetting('storage.move.id')) return;
	const db = database().sqlite;
	const config = s3Config();
	const stores: { disk: Disk; location: string }[] = [{ disk: storage(), location: 'disk' }];
	if (config) stores.push({ disk: s3Connection(config).disk, location: 's3' });
	for (const { disk, location } of stores) {
		for await (const file of storedFiles(disk, 'files/')) {
			if (getSetting('storage.move.id')) return;
			if (known(file.key, now)) {
				db.prepare('DELETE FROM stray_objects WHERE key = ? AND location = ?').run(file.key, location);
				continue;
			}
			db.prepare(
				'INSERT INTO stray_objects (key, location, first_seen_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
			).run(file.key, location, now);
			const row = db
				.prepare('SELECT first_seen_at FROM stray_objects WHERE key = ? AND location = ?')
				.get(file.key, location) as { first_seen_at: number };
			if (row.first_seen_at < now - objectRetentionMs && !known(file.key, now)) {
				await disk.delete(file.key);
				db.prepare('DELETE FROM stray_objects WHERE key = ? AND location = ?').run(file.key, location);
			}
		}
		for await (const file of storedFiles(disk, 'exports/')) {
			if (getSetting('storage.move.id')) return;
			if (db.prepare('SELECT 1 FROM exports WHERE object_key = ?').get(file.key)) continue;
			const archive = file.key.match(/^exports\/archive\/([^/]+)\/(\d{13})/);
			let until: number;
			if (archive) {
				const room = db.prepare('SELECT frozen_retention_days FROM rooms WHERE id = ?').get(archive[1]) as
					| { frozen_retention_days: number }
					| undefined;
				until = Number(archive[2]) + (room?.frozen_retention_days ?? 730) * 86_400_000;
			} else if (file.key.startsWith('exports/archive/')) continue;
			else until = (await file.getMetaData()).lastModified.getTime() + 7 * 86_400_000;
			if (until < now && !db.prepare('SELECT 1 FROM exports WHERE object_key = ?').get(file.key))
				await disk.delete(file.key);
		}
	}
	db.prepare(`DELETE FROM stray_objects WHERE key IN (SELECT key FROM objects)`).run();
}
