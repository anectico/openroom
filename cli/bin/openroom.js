#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, Option } from 'commander';

const directory = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(join(directory, '..', 'catalog.json'), 'utf8'));
const metadata = JSON.parse(await readFile(join(directory, '..', 'package.json'), 'utf8'));
const program = new Command()
	.name('openroom')
	.description('Manage your OpenRoom data room through its generated API commands.')
	.version(metadata.version)
	.addOption(new Option('--url <url>', 'OpenRoom server URL').env('OPENROOM_URL'))
	.addOption(
		new Option('--api-key <key>', 'API key; prefer OPENROOM_API_KEY to shell arguments').env(
			'OPENROOM_API_KEY',
		),
	)
	.option('--json', 'Print JSON results (the default)');
const operations = new Map();
const kebab = (value) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replaceAll('_', '-');
let warned = false;

function connection() {
	const { url, apiKey } = program.opts();
	if (!url || !apiKey)
		throw new Error('Set OPENROOM_URL and OPENROOM_API_KEY, or supply --url and --api-key.');
	const base = new URL(url);
	if (
		base.username ||
		base.password ||
		!['http:', 'https:'].includes(base.protocol) ||
		base.search ||
		base.hash ||
		!['/', '/api/v1', '/api/v1/'].includes(base.pathname)
	)
		throw new Error('Use the server root URL without credentials, query or fragment.');
	if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
		throw new Error('Use HTTPS. Plain HTTP is permitted only for local development.');
	return { origin: base.origin, apiKey };
}

async function request(path, method, body) {
	const { origin, apiKey } = connection();
	const response = await fetch(`${origin}${path}`, {
		method,
		headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
		redirect: 'error',
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const version = response.headers.get('x-openroom-version');
	if (!warned && version && version !== metadata.version && version !== `v${metadata.version}`) {
		process.stderr.write(`Server version ${version}; CLI version ${metadata.version}.\n`);
		warned = true;
	}
	const result = await response.json().catch(() => null);
	if (!response.ok) {
		const error = new Error(result?.error?.message ?? `The server returned HTTP ${response.status}.`);
		error.detail = result?.error ?? { code: 'http_error', status: response.status };
		throw error;
	}
	return result;
}

async function call(name, input) {
	const operation = operations.get(name);
	if (!operation) throw new Error(`Unknown operation ${name}. Regenerate the CLI catalog.`);
	let path = operation.path;
	const body = { ...input };
	for (const parameter of operation.parameters ?? []) {
		if (parameter.in !== 'path') continue;
		if (body[parameter.name] === undefined) throw new Error(`Missing ${parameter.name}.`);
		path = path.replace(`{${parameter.name}}`, encodeURIComponent(String(body[parameter.name])));
		delete body[parameter.name];
	}
	if (operation.method === 'GET') {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(body))
			if (value !== undefined)
				query.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
		path += query.size ? `?${query}` : '';
		return request(`/api/v1${path}`, 'GET');
	}
	return request(`/api/v1${path}`, operation.method, body);
}

function valueFor(raw, schema) {
	if (raw === undefined || raw === true) return true;
	const alternatives = schema.anyOf ?? schema.oneOf;
	if (alternatives) {
		if (raw === 'null' && alternatives.some((branch) => branch.type === 'null')) return null;
		const string = alternatives.find((branch) => branch.type === 'string');
		if (string) return valueFor(raw, string);
	}
	if (schema.type === 'string') return raw;
	if (schema.type === 'number' || schema.type === 'integer') {
		const number = Number(raw);
		if (!Number.isFinite(number)) throw new Error('Expected a number.');
		return number;
	}
	if (schema.type === 'boolean') {
		if (raw === 'true' || raw === 'false') return raw === 'true';
		throw new Error('Expected true or false.');
	}
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function inputProperties(schema) {
	const properties = { ...schema?.properties };
	for (const branch of schema?.anyOf ?? schema?.oneOf ?? schema?.allOf ?? [])
		for (const [name, value] of Object.entries(inputProperties(branch)))
			properties[name] = properties[name] ? { anyOf: [properties[name], value] } : value;
	return properties;
}

for (const [path, methods] of Object.entries(catalog.paths))
	for (const [method, entry] of Object.entries(methods)) {
		operations.set(entry.operationId, { ...entry, path, method: method.toUpperCase() });
		const properties = inputProperties(entry.requestBody?.content?.['application/json']?.schema);
		for (const parameter of entry.parameters ?? []) properties[parameter.name] = parameter.schema;
		const command = program
			.command(kebab(entry.operationId))
			.description(entry.summary)
			.option('--input <json>', 'Input JSON or @path to a JSON file');
		for (const [name, schema] of Object.entries(properties)) {
			const flag = `--${kebab(name)} ${schema.type === 'boolean' ? '[boolean]' : '<value>'}`;
			command.option(flag, schema.description ?? name, (raw) => valueFor(raw, schema));
		}
		command.action(async (options) => {
			let input = {};
			if (options.input)
				input = JSON.parse(
					options.input.startsWith('@') ? await readFile(options.input.slice(1), 'utf8') : options.input,
				);
			if (!input || typeof input !== 'object' || Array.isArray(input))
				throw new Error('--input must be a JSON object.');
			for (const name of Object.keys(properties))
				if (options[name] !== undefined) input[name] = options[name];
			process.stdout.write(`${JSON.stringify(await call(entry.operationId, input), null, 2)}\n`);
		});
	}

async function inspect(path, relative = '') {
	const entry = await lstat(path);
	if (entry.isSymbolicLink())
		throw new Error(`Symbolic links are not uploaded: ${relative || basename(path)}`);
	if (entry.isFile()) {
		if (!entry.size) throw new Error(`Empty files cannot be uploaded: ${relative || basename(path)}`);
		return [{ path, relative, size: entry.size }];
	}
	if (!entry.isDirectory()) throw new Error('Upload a regular file or directory.');
	const files = [{ path, relative, size: 0, directory: true }];
	for (const child of (await readdir(path)).sort())
		files.push(...(await inspect(join(path, child), relative ? `${relative}/${child}` : child)));
	return files;
}

program
	.command('upload <path>')
	.description('Stream a file or directory, preserving its folder tree. Symbolic links are refused.')
	.requiredOption('--room-id <id>', 'Destination room')
	.option('--folder-id <id>', 'Destination parent folder')
	.option('--contents', 'Upload folder contents without creating its enclosing folder')
	.option('--dry-run', 'List files without uploading')
	.action(async (source, options) => {
		const path = resolve(source);
		const info = await lstat(path);
		const files = await inspect(path);
		if (options.dryRun) {
			process.stdout.write(
				`${JSON.stringify(
					files.map((f) => ({ path: f.relative || basename(path), size: f.size })),
					null,
					2,
				)}\n`,
			);
			return;
		}
		const parents = new Map([['', options.folderId ?? null]]);
		if (info.isDirectory() && !options.contents)
			parents.set(
				'',
				(
					await call('create_folder', {
						roomId: options.roomId,
						parentId: options.folderId ?? null,
						name: basename(path),
					})
				).id,
			);
		async function folder(relative) {
			if (parents.has(relative)) return parents.get(relative);
			const parent = await folder(relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '');
			const created = await call('create_folder', {
				roomId: options.roomId,
				parentId: parent,
				name: relative.split('/').at(-1),
			});
			parents.set(relative, created.id);
			return created.id;
		}
		const result = [];
		for (const file of files) {
			if (file.directory) {
				if (file.relative) await folder(file.relative);
				continue;
			}
			const parent = info.isDirectory()
				? await folder(
						file.relative.includes('/') ? file.relative.slice(0, file.relative.lastIndexOf('/')) : '',
					)
				: (options.folderId ?? null);
			const pending = await call('create_upload', {
				target: { kind: 'file', roomId: options.roomId, folderId: parent },
				name: basename(file.path),
				size: file.size,
			});
			if (new URL(pending.url).origin !== connection().origin)
				throw new Error('The server returned an upload address on another origin.');
			const response = await fetch(pending.url, {
				method: 'PUT',
				headers: { 'content-type': 'application/octet-stream', 'content-length': String(file.size) },
				body: createReadStream(file.path),
				duplex: 'half',
				redirect: 'error',
			});
			if (!response.ok)
				throw new Error(`Upload failed with HTTP ${response.status}. Rerun to send it again.`);
			result.push(await call('finish_upload', { uploadId: pending.uploadId }));
		}
		process.stdout.write(`${JSON.stringify({ files: result }, null, 2)}\n`);
	});

program
	.command('doctor')
	.description('Check HTTPS access, current member, storage, disk and confirmed database replication.')
	.action(async () => {
		const health = await request('/healthz', 'GET');
		const member = await call('get_me', {});
		const system = await call('get_system_status', {});
		const checks = [
			{ name: 'server', ok: health.ok, detail: health.version },
			{ name: 'member', ok: true, detail: member.role },
			{ name: 'disk', ok: !system.diskLow, detail: system.diskFreeBytes },
			{
				name: 'backups',
				ok: system.backupsReady,
				detail:
					system.replication.error ??
					(system.s3Ready ? 'Replication confirmed' : 'Replica is on this server only'),
			},
		];
		process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
		if (checks.some((c) => !c.ok)) process.exitCode = 2;
	});

try {
	await program.parseAsync();
} catch (error) {
	process.stderr.write(`${JSON.stringify({ error: error.detail ?? { message: error.message } })}\n`);
	process.exitCode = 1;
}
