import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { database } from './db/index.ts';
import { enqueue } from './jobs.ts';
import { s3Config, s3Connection, s3Identity } from './s3.ts';
import { setSetting } from './settings.ts';
import { diskStream, localPath, writeToStorage } from './storage.ts';

export function queueStorageMove() {
	if (!s3Config()) return;
	const db = database().sqlite;
	if (
		db
			.prepare("SELECT 1 FROM jobs WHERE kind = 'storage.to_s3' AND done_at IS NULL AND failed_at IS NULL")
			.get()
	)
		return;
	enqueue('storage.to_s3', {}, { maxAttempts: 8 });
}

export async function moveDiskObjects() {
	const config = s3Config();
	if (!config) return;
	const identity = s3Identity(config);
	const db = database().sqlite;
	const rows = db
		.prepare("SELECT key, size, sha256 FROM objects WHERE location = 'disk' ORDER BY created_at")
		.all() as { key: string; size: number; sha256: string }[];
	try {
		for (const row of rows) {
			if (existsSync(localPath(row.key)))
				await writeToStorage(row.key, diskStream(row.key), row.size, 's3', config);
			const stream = await s3Connection(config).disk.getStream(row.key);
			const hash = createHash('sha256');
			let size = 0;
			for await (const chunk of stream) {
				hash.update(chunk);
				size += chunk.length;
			}
			if (size !== row.size || hash.digest('hex') !== row.sha256)
				throw new Error('The copied object failed its checksum check. The disk copy was kept.');
			if (s3Identity(s3Config() as NonNullable<ReturnType<typeof s3Config>>) !== identity)
				throw new Error('Storage settings changed during the move.');
			const changed = db
				.prepare(
					"UPDATE objects SET location = 's3' WHERE key = ? AND location = 'disk' AND sha256 = ? AND size = ?",
				)
				.run(row.key, row.sha256, row.size);
			if (changed.changes) rmSync(localPath(row.key), { force: true });
		}
		setSetting('storage.move_error', null);
		setSetting('storage.last_move_at', String(Date.now()));
	} catch {
		const message =
			'Some files could not be moved to S3. Disk copies are kept until the bucket copy passes its checksum check. Check the bucket and credentials, then retry.';
		setSetting('storage.move_error', message);
		throw new Error(message);
	}
}
