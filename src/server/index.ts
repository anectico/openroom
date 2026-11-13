import http from 'node:http';
import type { Socket } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { receiveUpload } from '../lib/server/uploads.ts';

type RuntimeControl = {
	stop: () => Promise<void>;
	checkpoint: () => unknown;
	storageConfig: () => unknown;
	replicationStatus: (status: {
		ok: boolean;
		checkedAt: number;
		error: string | null;
		root?: string | null;
		prefix?: string | null;
	}) => void;
};

const idleMs = 60_000;
const nonUploadLimitMs = 120_000;
const uploadDrainMs = 30_000;

const origin = process.env.ORIGIN ? new URL(process.env.ORIGIN) : null;
if (origin) process.env.PROTOCOL_HEADER = 'x-openroom-proto';
process.env.BODY_SIZE_LIMIT ??= '1M';

const handlerPath = resolve(process.env.BUILD_DIR ?? 'build', 'handler.js');
const { handler } = (await import(pathToFileURL(handlerPath).href)) as {
	handler: (req: http.IncomingMessage, res: http.ServerResponse, next?: () => void) => void;
};

const control = (globalThis as Record<symbol, RuntimeControl | undefined>)[Symbol.for('openroom.runtime')];
if (!control) throw new Error('The app runtime did not start.');

const activeUploads = new Set<http.IncomingMessage>();

const addressHeader = process.env.ADDRESS_HEADER?.toLowerCase();
const xffDepth = Number(process.env.XFF_DEPTH ?? 1);

function clientIp(req: http.IncomingMessage) {
	const fallback = req.socket.remoteAddress ?? '';
	if (!addressHeader) return fallback;
	const raw = req.headers[addressHeader];
	const value = (Array.isArray(raw) ? raw.join(',') : (raw ?? '')).trim();
	if (addressHeader !== 'x-forwarded-for') return value || fallback;
	const parts = value
		.split(',')
		.map((p) => p.trim())
		.filter(Boolean);
	return parts[parts.length - xffDepth] ?? fallback;
}

function isUpload(req: http.IncomingMessage) {
	return req.url?.startsWith('/upload/') ?? false;
}

async function handleUpload(req: http.IncomingMessage, res: http.ServerResponse) {
	activeUploads.add(req);
	res.on('close', () => activeUploads.delete(req));
	const token = req.url?.slice('/upload/'.length).split(/[?#]/)[0] ?? '';
	let result: Awaited<ReturnType<typeof receiveUpload>>;
	try {
		result = await receiveUpload(token, {
			method: req.method ?? '',
			contentType: req.headers['content-type'] ?? null,
			contentLength: req.headers['content-length'] ?? null,
			body: req,
		});
	} catch (error) {
		console.error('upload failed', error);
		result = {
			status: 500,
			body: { error: { code: 'internal', message: 'The upload failed on the server.' } },
		};
	}
	if (!req.complete) res.setHeader('connection', 'close');
	res
		.writeHead(result.status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
		.end(JSON.stringify(result.body));
}

const server = http.createServer((req, res) => {
	req.headers['x-openroom-ip'] = clientIp(req);
	if (origin) {
		req.headers.host = origin.host;
		req.headers['x-openroom-proto'] = origin.protocol.slice(0, -1);
	}
	if (isUpload(req)) return handleUpload(req, res);
	const limit = setTimeout(() => req.socket.destroy(), nonUploadLimitMs);
	const clear = () => clearTimeout(limit);
	req.on('end', clear);
	req.on('close', clear);
	handler(req, res);
});

server.requestTimeout = 0;
server.headersTimeout = nonUploadLimitMs;
server.keepAliveTimeout = 5_000;
server.on('connection', (socket: Socket) => {
	socket.setTimeout(idleMs, () => socket.destroy());
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => {
	console.log(`OpenRoom listening on ${host}:${port}`);
	process.send?.({ type: 'ready', config: control?.storageConfig() });
});

let stopping = false;

async function shutdown() {
	if (stopping) return;
	stopping = true;
	server.close();
	server.closeIdleConnections();
	const deadline = Date.now() + uploadDrainMs;
	while (activeUploads.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
	server.closeAllConnections();
	await control?.stop();
	process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on(
	'message',
	(message: {
		type?: string;
		ok?: boolean;
		checkedAt?: number;
		error?: string | null;
		root?: string | null;
		prefix?: string | null;
	}) => {
		if (
			message?.type === 'replication-status' &&
			typeof message.ok === 'boolean' &&
			typeof message.checkedAt === 'number'
		)
			control?.replicationStatus({
				ok: message.ok,
				checkedAt: message.checkedAt,
				error: message.error ?? null,
				root: message.root,
				prefix: message.prefix,
			});
		if (message?.type === 'checkpoint') {
			const result = control?.checkpoint();
			process.send?.({ type: 'checkpoint-done', result });
		}
	},
);
