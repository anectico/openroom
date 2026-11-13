import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AbortMultipartUploadCommand, ListMultipartUploadsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { database } from './db/index.ts';
import { requireDiskSpace } from './disk-space.ts';
import { newId } from './ids.ts';
import { dataDir } from './paths.ts';
import type { S3Config } from './s3.ts';
import { s3Config, s3Connection } from './s3.ts';
import { getSetting } from './settings.ts';

export const storageRoot = resolve(dataDir, 'storage');
export { diskMarginBytes, freeDiskBytes, requireDiskSpace } from './disk-space.ts';
export type StorageLocation = 'disk' | 's3';
let writes = 0;
export function storageWrites() {
	return writes;
}
export function assertStorageWritable() {
	if (getSetting('storage.move.id'))
		throw new Error('Storage is being moved. Uploads resume when the verified move finishes.');
}

let disk: Disk | null = null;

export function storage() {
	disk ??= new Disk(new FSDriver({ location: storageRoot, visibility: 'private' }));
	return disk;
}

export function localPath(key: string) {
	const path = resolve(storageRoot, key);
	if (!path.startsWith(`${storageRoot}/`)) throw new Error('Bad storage key.');
	return path;
}

export function newObjectKey() {
	const now = new Date();
	const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
	return `files/${month}/${newId('obj')}`;
}

export function writeLocation(): StorageLocation {
	return s3Config() ? 's3' : 'disk';
}

export async function objectStorage(key: string) {
	localPath(key);
	const object = database().sqlite.prepare('SELECT location FROM objects WHERE key = ?').get(key) as
		| { location: StorageLocation }
		| undefined;
	const config = s3Config();
	if (object?.location === 's3') {
		if (!config) throw new Error('S3 is required to read this stored file. Restore its storage settings.');
		return s3Connection(config).disk;
	}
	if (existsSync(localPath(key))) return storage();
	if (config) return s3Connection(config).disk;
	return storage();
}

export async function objectStream(key: string, range?: { start?: number; end?: number }) {
	return (await objectStorage(key)).getStream(key, range ? { range } : undefined);
}

export async function objectBytes(key: string, range?: { start?: number; end?: number }) {
	return (await objectStorage(key)).getBytes(key, range ? { range } : undefined);
}

export async function objectSize(key: string) {
	return (await (await objectStorage(key)).getMetaData(key)).contentLength;
}

export async function writeObject(key: string, body: Readable, size: number, location = writeLocation()) {
	assertStorageWritable();
	writes++;
	try {
		await writeToStorage(key, body, size, location, s3Config());
	} finally {
		writes--;
	}
}

export async function writeToStorage(
	key: string,
	body: Readable,
	size: number,
	location: StorageLocation,
	config: S3Config | null,
) {
	localPath(key);
	requireDiskSpace(location === 'disk' ? size : 0);
	if (location === 's3') {
		if (!config) throw new Error('S3 is no longer configured.');
		const partSize = Math.max(8 * 1024 ** 2, Math.ceil(size / 9_999 / 1024 ** 2) * 1024 ** 2);
		await new Upload({
			client: s3Connection(config).client,
			params: {
				Bucket: config.bucket,
				Key: key,
				Body: body,
				ContentLength: size,
				ContentType: 'application/octet-stream',
			},
			partSize,
			queueSize: 2,
			leavePartsOnError: false,
		}).done();
		return;
	}
	const path = localPath(key);
	mkdirSync(dirname(path), { recursive: true });
	await pipeline(body, createWriteStream(path));
	const handle = await open(path, 'r+');
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

export async function deleteStoredKey(key: string) {
	localPath(key);
	const config = s3Config();
	if (config) await s3Connection(config).disk.delete(key);
	rmSync(localPath(key), { force: true });
}

export async function abortUnfinishedUpload(key: string) {
	const config = s3Config();
	if (!config) return;
	const { client } = s3Connection(config);
	let keyMarker: string | undefined;
	let uploadIdMarker: string | undefined;
	do {
		const page = await client.send(
			new ListMultipartUploadsCommand({
				Bucket: config.bucket,
				Prefix: key,
				KeyMarker: keyMarker,
				UploadIdMarker: uploadIdMarker,
			}),
		);
		for (const item of page.Uploads ?? []) {
			if (item.Key === key && item.UploadId)
				await client.send(
					new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: key, UploadId: item.UploadId }),
				);
		}
		keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
		uploadIdMarker = page.NextUploadIdMarker;
	} while (keyMarker);
}

export async function hashObject(key: string) {
	const hash = createHash('sha256');
	let size = 0;
	for await (const chunk of await objectStream(key)) {
		size += chunk.length;
		hash.update(chunk);
	}
	return { size, sha256: hash.digest('hex') };
}

export function diskStream(key: string) {
	return createReadStream(localPath(key));
}

export function lazyObjectStream(key: string) {
	return Readable.from(
		(async function* () {
			for await (const chunk of await objectStream(key)) yield chunk;
		})(),
	);
}
