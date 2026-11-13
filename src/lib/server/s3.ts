import { S3Client } from '@aws-sdk/client-s3';
import { Disk } from 'flydrive';
import { S3Driver } from 'flydrive/drivers/s3';
import { s3SettingsInput } from '../schemas/storage.ts';
import type { Sqlite } from './db/connection.ts';
import { database } from './db/index.ts';
import { decrypt } from './secrets.ts';

export type S3Config = {
	bucket: string;
	region: string;
	endpoint: string | null;
	forcePathStyle: boolean;
	accessKeyId: string;
	secretAccessKey: string;
	source: 'env' | 'settings';
};

export function s3Identity(config: Pick<S3Config, 'bucket' | 'region' | 'endpoint' | 'forcePathStyle'>) {
	return JSON.stringify([config.bucket, config.region, config.endpoint, config.forcePathStyle]);
}

export function s3FromEnv(): S3Config | null {
	const values = [
		process.env.S3_BUCKET,
		process.env.S3_ACCESS_KEY_ID,
		process.env.S3_SECRET_ACCESS_KEY,
		process.env.S3_ENDPOINT,
		process.env.S3_REGION,
	];
	if (!values.some(Boolean)) return null;
	if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)
		throw new Error('S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together.');
	if (process.env.S3_FORCE_PATH_STYLE && !['true', 'false'].includes(process.env.S3_FORCE_PATH_STYLE))
		throw new Error('S3_FORCE_PATH_STYLE must be true or false.');
	const parsed = s3SettingsInput.safeParse({
		bucket: process.env.S3_BUCKET,
		region: process.env.S3_REGION || 'auto',
		endpoint: process.env.S3_ENDPOINT || null,
		forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
		accessKeyId: process.env.S3_ACCESS_KEY_ID,
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
	});
	if (!parsed.success)
		throw new Error(
			'Invalid S3 configuration. Check the bucket, region, credentials and HTTP or HTTPS endpoint without a path or query.',
		);
	return {
		...parsed.data,
		accessKeyId: parsed.data.accessKeyId as string,
		secretAccessKey: parsed.data.secretAccessKey as string,
		source: 'env',
	};
}

export function s3Config(db: Sqlite = database().sqlite): S3Config | null {
	const env = s3FromEnv();
	const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get();
	if (!table) return env;
	const value = (key: string) => {
		const row = db.prepare('SELECT value, value_enc FROM settings WHERE key = ?').get(`storage.s3.${key}`) as
			| { value: string | null; value_enc: string | null }
			| undefined;
		return row?.value_enc ? decrypt(row.value_enc) : (row?.value ?? null);
	};
	const config =
		env ??
		(value('bucket')
			? {
					bucket: value('bucket') as string,
					region: value('region') ?? 'auto',
					endpoint: value('endpoint'),
					forcePathStyle: value('force_path_style') !== 'false',
					accessKeyId: value('access_key_id') ?? '',
					secretAccessKey: value('secret_access_key') ?? '',
					source: 'settings' as const,
				}
			: null);
	const identity = value('identity');
	if (identity && (!config || identity !== s3Identity(config)))
		throw new Error(
			'This install is bound to its S3 bucket. Restore the original bucket, endpoint and region. Use the verified storage move operation to change buckets.',
		);
	return config;
}

const connections = new Map<string, { signature: string; client: S3Client; disk: Disk }>();

export function s3Connection(config: S3Config) {
	const signature = JSON.stringify(config);
	const cached = connections.get(signature);
	if (cached) return cached;
	const client = new S3Client({
		region: config.region,
		endpoint: config.endpoint ?? undefined,
		forcePathStyle: config.forcePathStyle,
		credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
		maxAttempts: 3,
	});
	const disk = new Disk(
		new S3Driver({ client, bucket: config.bucket, visibility: 'private', supportsACL: false }),
	);
	const connection = { signature, client, disk };
	connections.set(signature, connection);
	return connection;
}
