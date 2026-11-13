import { createReadStream, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const allowed = ['cmaps/', 'standard_fonts/', 'wasm/', 'iccs/'];

export const GET: RequestHandler = ({ params }) => {
	if (!allowed.some((p) => params.path.startsWith(p)) || params.path.includes('..')) error(404, 'Not found');
	const path = resolve(root, params.path);
	if (!path.startsWith(`${root}/`) || !existsSync(path) || !statSync(path).isFile()) error(404, 'Not found');
	const type = path.endsWith('.wasm')
		? 'application/wasm'
		: path.endsWith('.js') || path.endsWith('.mjs')
			? 'text/javascript'
			: 'application/octet-stream';
	return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
		headers: {
			'content-type': type,
			'cache-control': 'public, max-age=604800',
			'x-content-type-options': 'nosniff',
		},
	});
};
