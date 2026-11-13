import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { dbPath } from '../lib/server/paths.ts';
import type { S3Config } from '../lib/server/s3.ts';
import { probeReplication } from './health.ts';
import {
	appendPrefix,
	currentPrefix,
	litestreamConfigPath,
	litestreamEnv,
	litestreamSocketPath,
	replicaRoot,
	writeLitestreamConfig,
} from './replica.ts';
import { litestreamBin, restoreIfRequested, rollbackIfMarked } from './startup.ts';

const run = promisify(execFile);
const checkpointAfterMs = 10 * 60_000;
let app: ChildProcess | null = null;
let litestream: ChildProcess | null = null;
let shuttingDown = false;
let configuring = false;
let litestreamDownSince: number | null = null;
let lastCheckpointAt = 0;
let restartDelay = 1_000;
let restartTimer: NodeJS.Timeout | null = null;
let activeConfig: S3Config | null = null;
let activeRoot: string | null = null;
let activePrefix: string | null = null;
let signature: string | null = null;
let configuration = Promise.resolve();

function waitForExit(child: ChildProcess | null, ms: number) {
	return new Promise<void>((done) => {
		if (!child || child.exitCode !== null || child.signalCode !== null) return done();
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			done();
		}, ms);
		child.once('close', () => {
			clearTimeout(timer);
			done();
		});
	});
}

function report(ok: boolean, error: string | null, checkedAt = Date.now()) {
	if (app?.connected)
		app.send({ type: 'replication-status', ok, error, checkedAt, root: activeRoot, prefix: activePrefix });
}

function startLitestream() {
	if (shuttingDown || configuring || litestream) return;
	if (existsSync(litestreamSocketPath)) rmSync(litestreamSocketPath);
	const child = spawn(litestreamBin, ['replicate', '-config', litestreamConfigPath], {
		stdio: 'inherit',
		env: litestreamEnv(activeConfig),
	});
	litestream = child;
	const startedAt = Date.now();
	child.on('error', () => report(false, 'Litestream could not start. Check the container logs.'));
	child.on('close', (code, signal) => {
		if (litestream !== child) return;
		litestream = null;
		if (shuttingDown) return;
		litestreamDownSince ??= Date.now();
		report(false, 'Litestream stopped. OpenRoom is restarting it.');
		console.error(
			`litestream stopped (code ${code}, signal ${signal}); restarting in ${restartDelay / 1000}s`,
		);
		if (Date.now() - startedAt > 60_000) restartDelay = 1_000;
		restartTimer = setTimeout(() => {
			restartTimer = null;
			startLitestream();
		}, restartDelay);
		restartDelay = Math.min(restartDelay * 2, 60_000);
	});
	child.on('spawn', () => {
		litestreamDownSince = null;
	});
}

async function configure(config: S3Config | null) {
	const nextSignature = JSON.stringify(config);
	if (signature === nextSignature) return;
	configuring = true;
	if (restartTimer) clearTimeout(restartTimer);
	const previous = litestream;
	litestream = null;
	previous?.kill('SIGTERM');
	await waitForExit(previous, 30_000);
	const root = replicaRoot(config);
	try {
		const prefix =
			activeRoot && activeRoot !== root
				? await appendPrefix('storage-change', root, config)
				: await currentPrefix(root, config);
		writeLitestreamConfig(prefix.prefix, root, config);
		if (activeRoot && activeRoot !== root)
			await run(litestreamBin, ['reset', '-config', litestreamConfigPath, dbPath], {
				env: litestreamEnv(config),
				timeout: 30_000,
			});
		activeConfig = config;
		activeRoot = root;
		activePrefix = prefix.prefix;
		signature = nextSignature;
		restartDelay = 1_000;
		console.log(`replicating to ${root} prefix ${prefix.prefix}`);
	} catch {
		report(
			false,
			'The database replica could not be configured. Check storage settings and the container logs.',
		);
		throw new Error('Could not configure the database replica.');
	} finally {
		configuring = false;
	}
	startLitestream();
}

function requestConfiguration(config: S3Config | null) {
	configuration = configuration
		.then(() => configure(config))
		.catch(() => {
			litestreamDownSince ??= Date.now();
			if (!shuttingDown) restartTimer = setTimeout(() => requestConfiguration(config), 30_000);
		});
}

let checking = false;
setInterval(async () => {
	if (shuttingDown || configuring || checking || !app?.connected) return;
	checking = true;
	try {
		if (litestream) {
			const child = litestream;
			const result = await probeReplication();
			if (child === litestream) report(result.ok, result.error, result.checkedAt);
		} else {
			litestreamDownSince ??= Date.now();
			const now = Date.now();
			if (now - litestreamDownSince >= checkpointAfterMs && now - lastCheckpointAt >= checkpointAfterMs) {
				lastCheckpointAt = now;
				app.send({ type: 'checkpoint' });
			}
		}
	} finally {
		checking = false;
	}
}, 30_000).unref();

function startApp() {
	const child = spawn(process.execPath, [resolve(import.meta.dirname, '..', 'server', 'index.ts')], {
		stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
	});
	app = child;
	child.on('message', (message: { type?: string; config?: S3Config | null }) => {
		if (shuttingDown) return;
		if (message?.type === 'ready' || message?.type === 'replication-config')
			requestConfiguration(message.config ?? null);
	});
	child.on('exit', async (code, signal) => {
		app = null;
		if (shuttingDown) return;
		console.error(`app exited (code ${code}, signal ${signal}); stopping`);
		await shutdown(code ?? 1);
	});
}

async function shutdown(exitCode = 0) {
	if (shuttingDown) return;
	shuttingDown = true;
	if (restartTimer) clearTimeout(restartTimer);
	app?.kill('SIGTERM');
	await waitForExit(app, 45_000);
	litestream?.kill('SIGTERM');
	await waitForExit(litestream, 10_000);
	process.exit(exitCode);
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

try {
	await restoreIfRequested();
	await rollbackIfMarked();
} catch (error) {
	console.error(error instanceof Error ? error.message : 'OpenRoom could not start.');
	process.exit(1);
}
startApp();
