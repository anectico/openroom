import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import type { Sqlite } from '../lib/server/db/connection.ts';
import { type S3Config, s3Connection } from '../lib/server/s3.ts';
import { decrypt } from '../lib/server/secrets.ts';
import { storageRoot } from '../lib/server/storage.ts';

export function checkSavedSecrets(db: Sqlite) {
	for (const [table, column] of [
		['settings', 'value_enc'],
		['links', 'token_enc'],
		['webhooks', 'secret_enc'],
		['webhooks', 'url_enc'],
	]) {
		if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) continue;
		for (const row of db
			.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`)
			.all() as { value: string }[]) {
			try {
				decrypt(row.value);
			} catch {
				throw new Error(
					'The saved secrets do not decrypt. Supply the OPENROOM_SECRET_KEY used at this backup point.',
				);
			}
		}
	}
}

export async function checkStoredFiles(db: Sqlite, config: S3Config | null) {
	if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'objects'").get()) return;
	const rows = db.prepare('SELECT key, size, location FROM objects WHERE refcount > 0').all() as {
		key: string;
		size: number;
		location: string;
	}[];
	const local = new Disk(new FSDriver({ location: storageRoot, visibility: 'private' }));
	let missing = 0;
	for (const row of rows) {
		try {
			let size: number;
			if (row.location !== 's3' && (await local.exists(row.key)))
				size = (await local.getMetaData(row.key)).contentLength;
			else if (config) size = (await s3Connection(config).disk.getMetaData(row.key)).contentLength;
			else throw new Error('missing');
			if (size !== row.size) missing++;
		} catch {
			missing++;
		}
	}
	if (missing)
		throw new Error(
			`${missing} referenced file(s) are missing or have the wrong size. Restore stopped; no empty install was created. Check the bucket and the old server’s disk files.`,
		);
}
