import { createHash } from 'node:crypto';
import type { Disk } from 'flydrive';
import { database } from './db/index.ts';
import { newId } from './ids.ts';
import { enqueue } from './jobs.ts';
import { type S3Config, s3Config, s3Connection, s3Identity } from './s3.ts';
import { deleteSetting, getSecretSetting, getSetting, setSecretSetting, setSetting } from './settings.ts';
import { hashObject, objectStream, storage, storageWrites, writeToStorage } from './storage.ts';

export type StorageTarget = { kind: 'disk' } | { kind: 's3'; config: S3Config };

export function transferStatus() {
	const target = getSecretSetting('storage.move.target');
	const parsed = target ? (JSON.parse(target) as StorageTarget) : null;
	return {
		id: getSetting('storage.move.id'),
		target: parsed ? (parsed.kind === 'disk' ? 'Local disk' : parsed.config.bucket) : null,
		copied: Number(getSetting('storage.move.copied') ?? 0),
		total: Number(getSetting('storage.move.total') ?? 0),
		error: getSetting('storage.move.error'),
	};
}

export function queueTransfer(target: StorageTarget) {
	const db = database().sqlite;
	if (getSetting('storage.move.id'))
		throw new Error('A storage move is already in progress. Retry or cancel it first.');
	if (storageWrites() || db.prepare('SELECT 1 FROM uploads WHERE in_progress_since IS NOT NULL').get())
		throw new Error('An upload is still running. Wait for it to finish before moving storage.');
	const id = newId('move');
	setSecretSetting('storage.move.target', JSON.stringify(target));
	setSetting('storage.move.id', id);
	setSetting('storage.move.source', s3Config() ? s3Identity(s3Config() as S3Config) : 'disk');
	setSetting('storage.move.copied', '0');
	setSetting('storage.move.error', null);
	enqueue('storage.transfer', { id });
	return id;
}

export function resumeTransfer() {
	const id = getSetting('storage.move.id');
	if (!id) return;
	const db = database().sqlite;
	const pending = db
		.prepare(
			"SELECT id, locked_at FROM jobs WHERE kind = 'storage.transfer' AND json_extract(payload, '$.id') = ? AND done_at IS NULL AND failed_at IS NULL",
		)
		.get(id) as { id: number; locked_at: number | null } | undefined;
	if (!pending) enqueue('storage.transfer', { id });
	else if (pending.locked_at === null) {
		db.prepare('UPDATE jobs SET run_at = ?, last_error = NULL WHERE id = ?').run(Date.now(), pending.id);
		setSetting('storage.move.error', null);
	}
}

export function cancelTransfer() {
	for (const key of ['id', 'target', 'source', 'copied', 'total', 'error'])
		deleteSetting(`storage.move.${key}`);
}

async function matches(disk: Disk, key: string, size: number, expected: string | null) {
	if (!(await disk.exists(key))) return false;
	if ((await disk.getMetaData(key)).contentLength !== size) return false;
	if (!expected) return true;
	const hash = createHash('sha256');
	for await (const chunk of await disk.getStream(key)) hash.update(chunk);
	return hash.digest('hex') === expected;
}

export async function runStorageTransfer(payload: unknown) {
	const { id } = payload as { id: string };
	if (getSetting('storage.move.id') !== id) return;
	const encoded = getSecretSetting('storage.move.target');
	if (!encoded) return;
	const target = JSON.parse(encoded) as StorageTarget;
	const db = database().sqlite;
	const source = s3Config();
	const sourceIdentity = source ? s3Identity(source) : 'disk';
	const destination = target.kind === 's3' ? s3Connection(target.config).disk : storage();
	const same = target.kind === 's3' && source && s3Identity(target.config) === s3Identity(source);
	const current = () =>
		getSetting('storage.move.id') === id && getSetting('storage.move.source') === sourceIdentity;
	try {
		if (!current()) throw new Error('changed');
		setSetting('storage.move.error', null);
		if (target.kind === 's3' && !same && (await destination.exists('db/CURRENT')))
			throw new Error('bucket_in_use');
		const objects = db.prepare('SELECT key, size, sha256, location FROM objects').all() as {
			key: string;
			size: number;
			sha256: string;
			location: string;
		}[];
		const pending = db
			.prepare(
				'SELECT object_key AS key, received_size AS size, sha256, location FROM uploads WHERE finished_at IS NULL AND received_size IS NOT NULL',
			)
			.all() as typeof objects;
		const archives = db
			.prepare(
				"SELECT object_key AS key, size FROM exports WHERE kind = 'archive' AND status = 'ready' AND object_key IS NOT NULL",
			)
			.all() as { key: string; size: number }[];
		const files = [
			...objects,
			...pending,
			...archives.map((a) => ({ ...a, sha256: null, location: 'archive' })),
		];
		setSetting('storage.move.total', String(files.length));
		let copied = 0;
		for (const file of files) {
			if (!file.sha256) file.sha256 = (await hashObject(file.key)).sha256;
			if (!current()) return;
			if (!(await matches(destination, file.key, file.size, file.sha256))) {
				if ((target.kind === 'disk' && file.location === 'disk') || (same && file.location === 's3'))
					throw new Error('source_checksum');
				await writeToStorage(
					file.key,
					await objectStream(file.key),
					file.size,
					target.kind === 's3' ? 's3' : 'disk',
					target.kind === 's3' ? target.config : null,
				);
				if (!(await matches(destination, file.key, file.size, file.sha256)))
					throw new Error('destination_checksum');
			}
			setSetting('storage.move.copied', String(++copied));
		}
		if (!current()) return;
		if (target.kind === 's3' && !same && (await destination.exists('db/CURRENT')))
			throw new Error('bucket_in_use');
		db.transaction(() => {
			if (
				!current() ||
				storageWrites() ||
				db.prepare('SELECT 1 FROM uploads WHERE in_progress_since IS NOT NULL').get()
			)
				throw new Error('changed');
			if (target.kind === 's3') {
				for (const [key, value] of [
					['bucket', target.config.bucket],
					['region', target.config.region],
					['endpoint', target.config.endpoint],
					['force_path_style', String(target.config.forcePathStyle)],
					['identity', s3Identity(target.config)],
				])
					setSetting(`storage.s3.${key}`, value);
				setSecretSetting('storage.s3.access_key_id', target.config.accessKeyId);
				setSecretSetting('storage.s3.secret_access_key', target.config.secretAccessKey);
			} else db.prepare("DELETE FROM settings WHERE key LIKE 'storage.s3.%'").run();
			db.prepare('UPDATE objects SET location = ?').run(target.kind);
			db.prepare('UPDATE uploads SET location = ? WHERE finished_at IS NULL').run(target.kind);
			setSetting('replication.last_ok_at', null);
			setSetting(
				'replication.error',
				'Storage changed. Waiting for the new database replica to be confirmed.',
			);
			setSetting('storage.last_move_at', String(Date.now()));
			cancelTransfer();
		}).immediate();
		process.send?.({ type: 'replication-config', config: target.kind === 's3' ? target.config : null });
	} catch {
		if (getSetting('storage.move.id') !== id) return;
		const message =
			'The storage move stopped before switching. The original storage is still active. Check the destination permissions, free space and file checksums, then retry or cancel.';
		setSetting('storage.move.error', message);
		throw new Error(message);
	}
}
