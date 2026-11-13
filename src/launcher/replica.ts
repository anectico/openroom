import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { dataDir, dbPath, localReplicaDir } from '../lib/server/paths.ts';
import { type S3Config, s3Connection } from '../lib/server/s3.ts';

export type PrefixEntry = { startedAt: string; prefix: string };
export const litestreamConfigPath = join(dataDir, 'litestream.yml');
export const litestreamSocketPath = join(dataDir, 'litestream.sock');

export function replicaRoot(config: S3Config | null = null) {
	return config ? `s3://${config.bucket}/db` : (process.env.REPLICA_URL ?? `file://${localReplicaDir}`);
}

function pointerKey(root: string, config: S3Config | null) {
	if (!config || root !== replicaRoot(config))
		throw new Error('The restore bucket must match S3_BUCKET and use its db/ prefix.');
	return 'db/CURRENT';
}

function parsePrefixes(text: string): PrefixEntry[] {
	const entries = text
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const [startedAt, prefix] = line.split(' ');
			if (!startedAt || !Number.isFinite(Date.parse(startedAt)) || !/^db-[a-z0-9]+$/.test(prefix ?? ''))
				throw new Error('The replica CURRENT file is invalid. Nothing was changed.');
			return { startedAt, prefix };
		});
	if (entries.some((entry, i) => i > 0 && entry.startedAt < entries[i - 1].startedAt))
		throw new Error('The replica CURRENT history is out of order. Nothing was changed.');
	return entries;
}

async function pointer(root: string, config: S3Config | null) {
	if (root.startsWith('file://')) {
		const path = join(root.slice(7), 'CURRENT');
		return { text: existsSync(path) ? readFileSync(path, 'utf8') : '', etag: null as string | null };
	}
	const key = pointerKey(root, config);
	try {
		const result = await s3Connection(config as S3Config).client.send(
			new GetObjectCommand({ Bucket: (config as S3Config).bucket, Key: key }),
		);
		if (result.ContentLength && result.ContentLength > 1024 ** 2)
			throw new Error('The replica CURRENT file is too large.');
		return { text: (await result.Body?.transformToString()) ?? '', etag: result.ETag ?? null };
	} catch (error) {
		if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
			return { text: '', etag: null };
		throw new Error('Could not read the replica CURRENT file. Check the bucket and credentials.');
	}
}

export async function readPrefixes(root = replicaRoot(), config: S3Config | null = null) {
	return parsePrefixes((await pointer(root, config)).text);
}

export async function appendPrefix(
	reason: string,
	root = replicaRoot(),
	config: S3Config | null = null,
): Promise<PrefixEntry> {
	const current = await pointer(root, config);
	parsePrefixes(current.text);
	const startedAt = new Date().toISOString();
	const prefix = `db-${startedAt.replace(/[-:.]/g, '').toLowerCase()}${randomBytes(4).toString('hex')}`;
	const text = `${current.text}${current.text && !current.text.endsWith('\n') ? '\n' : ''}${startedAt} ${prefix} ${reason}\n`;
	if (root.startsWith('file://')) {
		mkdirSync(root.slice(7), { recursive: true });
		writeFileSync(join(root.slice(7), 'CURRENT'), text, { mode: 0o600 });
	} else {
		const key = pointerKey(root, config);
		await s3Connection(config as S3Config).client.send(
			new PutObjectCommand({
				Bucket: (config as S3Config).bucket,
				Key: key,
				Body: text,
				ContentType: 'text/plain',
				IfMatch: current.etag ?? undefined,
				IfNoneMatch: current.etag ? undefined : '*',
			}),
		);
	}
	return { startedAt, prefix };
}

export async function currentPrefix(root = replicaRoot(), config: S3Config | null = null) {
	return (await readPrefixes(root, config)).at(-1) ?? (await appendPrefix('first', root, config));
}

export async function prefixFor(at: Date | null, root = replicaRoot(), config: S3Config | null = null) {
	const entries = await readPrefixes(root, config);
	if (!at) return entries.at(-1) ?? null;
	return entries.findLast((entry) => new Date(entry.startedAt) <= at) ?? null;
}

export function litestreamEnv(config: S3Config | null) {
	return {
		...process.env,
		AWS_ACCESS_KEY_ID: config?.accessKeyId ?? '',
		AWS_SECRET_ACCESS_KEY: config?.secretAccessKey ?? '',
	};
}

export function writeLitestreamConfig(prefix: string, root = replicaRoot(), config: S3Config | null = null) {
	const replica = root.startsWith('file://')
		? ['      type: file', `      path: ${JSON.stringify(join(root.slice(7), prefix))}`]
		: [
				'      type: s3',
				`      bucket: ${JSON.stringify(config?.bucket)}`,
				`      path: ${JSON.stringify(`db/${prefix}`)}`,
				`      region: ${JSON.stringify(config?.region)}`,
				...(config?.endpoint ? [`      endpoint: ${JSON.stringify(config.endpoint)}`] : []),
				`      force-path-style: ${config?.forcePathStyle ?? true}`,
			];
	mkdirSync(dataDir, { recursive: true });
	writeFileSync(
		litestreamConfigPath,
		[
			'dbs:',
			`  - path: ${JSON.stringify(dbPath)}`,
			'    replica:',
			...replica,
			'snapshot:',
			'  interval: 24h',
			'  retention: 720h',
			'socket:',
			'  enabled: true',
			`  path: ${JSON.stringify(litestreamSocketPath)}`,
			'',
		].join('\n'),
		{ mode: 0o600 },
	);
	return `${root.replace(/\/$/, '')}/${prefix}`;
}
