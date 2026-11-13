import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { ListMultipartUploadsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { z } from 'zod';
import { s3SettingsInput } from '../schemas/storage.ts';
import { database } from '../server/db/index.ts';
import { newId } from '../server/ids.ts';
import { type S3Config, s3Config, s3Connection, s3Identity } from '../server/s3.ts';
import { getSetting, setSecretSetting, setSetting } from '../server/settings.ts';
import { queueStorageMove } from '../server/storage-move.ts';
import {
	cancelTransfer,
	queueTransfer,
	resumeTransfer,
	type StorageTarget,
	transferStatus,
} from '../server/storage-transfer.ts';
import { confirmField, defineOperation, OpError } from './define.ts';
import { authorize } from './execute.ts';

const storageStatus = z.object({
	configured: z.boolean(),
	source: z.enum(['env', 'settings']).nullable(),
	bucket: z.string().nullable(),
	region: z.string().nullable(),
	endpoint: z.string().nullable(),
	forcePathStyle: z.boolean(),
	hasCredentials: z.boolean(),
	lastOkAt: z.number().nullable(),
	lastError: z.string().nullable(),
	moveError: z.string().nullable(),
	diskObjects: z.number(),
	diskBytes: z.number(),
	s3Objects: z.number(),
	s3Bytes: z.number(),
	moving: z.boolean(),
	transfer: z.object({
		id: z.string().nullable(),
		target: z.string().nullable(),
		copied: z.number(),
		total: z.number(),
		error: z.string().nullable(),
	}),
});

function status(): z.input<typeof storageStatus> {
	const config = s3Config();
	const db = database().sqlite;
	const count = (location: string) =>
		db
			.prepare('SELECT count(*) AS count, coalesce(sum(size), 0) AS bytes FROM objects WHERE location = ?')
			.get(location) as { count: number; bytes: number };
	const disk = count('disk');
	const s3 = count('s3');
	return {
		configured: !!config,
		transfer: transferStatus(),
		source: config?.source ?? null,
		bucket: config?.bucket ?? null,
		region: config?.region ?? null,
		endpoint: config?.endpoint ?? null,
		forcePathStyle: config?.forcePathStyle ?? true,
		hasCredentials: !!config?.accessKeyId && !!config?.secretAccessKey,
		lastOkAt: Number(getSetting('storage.last_ok_at')) || null,
		lastError: getSetting('storage.last_error'),
		moveError: getSetting('storage.move_error'),
		diskObjects: disk.count,
		diskBytes: disk.bytes,
		s3Objects: s3.count,
		s3Bytes: s3.bytes,
		moving: !!db
			.prepare("SELECT 1 FROM jobs WHERE kind = 'storage.to_s3' AND done_at IS NULL AND failed_at IS NULL")
			.get(),
	};
}

async function probe(config: S3Config, checkExisting = true) {
	const { client, disk } = s3Connection(config);
	const key = `files/probe-${newId('check')}`;
	const body = randomBytes(64);
	try {
		await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: 'files/', MaxKeys: 1 }));
		await client.send(new ListMultipartUploadsCommand({ Bucket: config.bucket, MaxUploads: 1 }));
		const existing = database()
			.sqlite.prepare("SELECT key, sha256 FROM objects WHERE location = 's3' LIMIT 1")
			.get() as { key: string; sha256: string } | undefined;
		if (checkExisting && existing) {
			const hash = createHash('sha256');
			for await (const chunk of await disk.getStream(existing.key)) hash.update(chunk);
			if (hash.digest('hex') !== existing.sha256) throw new Error('existing_file');
		}
		await new Upload({
			client,
			params: { Bucket: config.bucket, Key: key, Body: Readable.from(body), ContentLength: body.length },
			leavePartsOnError: false,
		}).done();
		if (!Buffer.from(await disk.getBytes(key)).equals(body)) throw new Error('test_file');
	} finally {
		await disk.delete(key);
	}
}

function safeStorageError() {
	return 'The S3 check failed. Check the endpoint, bucket, region and credentials, and allow listing, reading, writing, deleting and multipart uploads in this private bucket.';
}

export const getStorageSettings = defineOperation({
	name: 'get_storage_settings',
	summary:
		'Show optional S3 storage, its last check and progress copying disk files to the bucket. Credentials are never returned.',
	role: 'owner',
	http: { method: 'GET', path: '/settings/storage' },
	input: z.object({}),
	output: storageStatus,
	audit: false,
	run: () => status(),
});

export const updateStorageSettings = defineOperation({
	name: 'update_storage_settings',
	summary:
		'Test and save a private S3-compatible bucket, then copy existing disk files with checksum verification. Use move_storage to change or remove a bucket. Omitted credentials keep the saved ones.',
	role: 'owner',
	http: { method: 'PUT', path: '/settings/storage' },
	input: s3SettingsInput,
	output: storageStatus,
	audit: { target: () => ({ type: 'settings', id: 'storage' }), detail: () => ({ configured: true }) },
	run: async (input, ctx) => {
		const current = s3Config();
		if (getSetting('storage.move.id'))
			throw new OpError(409, 'storage_moving', 'Finish or cancel the storage move first.');
		if (current?.source === 'env')
			throw new OpError(409, 'set_by_server', 'Storage is set by the server and is read only here.');
		const config: S3Config = {
			...input,
			accessKeyId: input.accessKeyId ?? current?.accessKeyId ?? '',
			secretAccessKey: input.secretAccessKey ?? current?.secretAccessKey ?? '',
			source: 'settings',
		};
		if (!config.accessKeyId || !config.secretAccessKey)
			throw new OpError(400, 'missing_credentials', 'Paste the access key ID and secret access key.');
		if (current && s3Identity(current) !== s3Identity(config))
			throw new OpError(
				409,
				'bucket_locked',
				'Use move_storage to copy and verify data before changing its bucket, endpoint or region.',
			);
		try {
			if (!current && (await s3Connection(config).disk.exists('db/CURRENT')))
				throw new OpError(
					409,
					'bucket_in_use',
					'This bucket already holds a database replica. Use the fresh-install restore procedure to recover it, or choose an empty bucket.',
				);
			await probe(config);
		} catch (error) {
			if (error instanceof OpError) throw error;
			throw new OpError(400, 'storage_check_failed', safeStorageError());
		}
		database()
			.sqlite.transaction(() => {
				authorize(ctx, 'owner');
				const latest = s3Config();
				if (latest && s3Identity(latest) !== s3Identity(config))
					throw new OpError(
						409,
						'bucket_locked',
						'Storage was configured by another request. Keep its bucket settings.',
					);
				setSetting('storage.s3.bucket', config.bucket);
				setSetting('storage.s3.region', config.region);
				setSetting('storage.s3.endpoint', config.endpoint);
				setSetting('storage.s3.force_path_style', String(config.forcePathStyle));
				setSecretSetting('storage.s3.access_key_id', config.accessKeyId);
				setSecretSetting('storage.s3.secret_access_key', config.secretAccessKey);
				setSetting('storage.s3.identity', s3Identity(config));
				setSetting('storage.last_ok_at', String(Date.now()));
				setSetting('storage.last_error', null);
				queueStorageMove();
			})
			.immediate();
		process.send?.({ type: 'replication-config', config });
		return status();
	},
});

export const testStorage = defineOperation({
	name: 'test_storage',
	summary: 'Write, read and delete a test object and verify an existing S3 file with the saved credentials.',
	role: 'owner',
	http: { method: 'POST', path: '/settings/storage/test' },
	input: z.object({}),
	output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
	audit: {
		target: () => ({ type: 'settings', id: 'storage' }),
		detail: (_input, result) => ({ ok: result.ok }),
	},
	run: async () => {
		const config = s3Config();
		if (!config) throw new OpError(409, 'storage_not_configured', 'Set up S3 first.');
		try {
			await probe(config);
			setSetting('storage.last_ok_at', String(Date.now()));
			setSetting('storage.last_error', null);
			return { ok: true, error: null };
		} catch {
			const error = safeStorageError();
			setSetting('storage.last_error', error);
			return { ok: false, error };
		}
	},
});

export const retryStorageMove = defineOperation({
	name: 'retry_storage_move',
	summary:
		'Retry copying disk files into the configured S3 bucket. A disk copy is removed only after the remote size and SHA-256 match.',
	role: 'owner',
	http: { method: 'POST', path: '/settings/storage/move' },
	input: z.object({}),
	output: storageStatus,
	audit: { target: () => ({ type: 'settings', id: 'storage' }) },
	run: () => {
		if (getSetting('storage.move.id')) resumeTransfer();
		else {
			if (!s3Config()) throw new OpError(409, 'storage_not_configured', 'Set up S3 first.');
			queueStorageMove();
		}
		return status();
	},
});

export type StorageSettings = z.infer<typeof storageStatus>;

export const moveStorage = defineOperation({
	name: 'move_storage',
	summary:
		'Copy and verify every retained file and received upload before switching storage. Uploads pause during the move; the old bucket is kept.',
	role: 'owner',
	http: { method: 'POST', path: '/settings/storage/transfer' },
	input: z.object({
		target: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('disk') }),
			s3SettingsInput.extend({ kind: z.literal('s3') }),
		]),
		...confirmField,
	}),
	output: z.object({ id: z.string() }),
	destructive: (input) =>
		`Move retained files to ${input.target.kind === 'disk' ? 'local disk' : input.target.bucket}, verify their checksums, then switch storage and database replication. Uploads pause until the move finishes. Keep the old bucket for at least 30 days.`,
	audit: {
		target: () => ({ type: 'settings', id: 'storage' }),
		detail: (input) => ({ destination: input.target.kind }),
	},
	run: async (input, ctx) => {
		if (s3Config()?.source === 'env')
			throw new OpError(
				409,
				'set_by_server',
				'Remove S3 environment overrides before moving storage. Keep the saved encrypted settings.',
			);
		if (getSetting('storage.move.id'))
			throw new OpError(409, 'move_in_progress', 'Retry or cancel the current storage move first.');
		let target: StorageTarget;
		if (input.target.kind === 'disk') target = { kind: 'disk' };
		else {
			const config: S3Config = {
				...input.target,
				accessKeyId: input.target.accessKeyId ?? '',
				secretAccessKey: input.target.secretAccessKey ?? '',
				source: 'settings',
			};
			if (!config.accessKeyId || !config.secretAccessKey)
				throw new OpError(400, 'missing_credentials', 'Provide credentials for the destination bucket.');
			try {
				if (await s3Connection(config).disk.exists('db/CURRENT'))
					throw new OpError(409, 'bucket_in_use', 'Choose a destination with no database replica.');
				await probe(config, false);
			} catch (error) {
				if (error instanceof OpError) throw error;
				throw new OpError(400, 'storage_check_failed', safeStorageError());
			}
			target = { kind: 's3', config };
		}
		authorize(ctx, 'owner');
		try {
			return database()
				.sqlite.transaction(() => ({ id: queueTransfer(target) }))
				.immediate();
		} catch (error) {
			throw new OpError(409, 'storage_busy', error instanceof Error ? error.message : 'Storage is busy.');
		}
	},
});

export const cancelStorageMove = defineOperation({
	name: 'cancel_storage_move',
	summary:
		'Cancel an unfinished storage move. Original storage remains active; partial destination copies are retained.',
	role: 'owner',
	http: { method: 'POST', path: '/settings/storage/transfer/cancel' },
	input: z.object({}),
	output: z.object({ ok: z.literal(true) }),
	audit: { target: () => ({ type: 'settings', id: 'storage' }) },
	run: () => {
		cancelTransfer();
		return { ok: true as const };
	},
});
