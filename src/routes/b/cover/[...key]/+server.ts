import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { database } from '#lib/server/db/index.ts';
import { objectStream } from '#lib/server/storage.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	if (!database().sqlite.prepare('SELECT 1 FROM rooms WHERE cover_object_key = ?').get(params.key))
		error(404, 'Not found');
	return new Response(Readable.toWeb(await objectStream(params.key)) as ReadableStream, {
		headers: {
			'content-type': 'image/webp',
			'cache-control': 'public, max-age=86400',
			'x-content-type-options': 'nosniff',
			'content-security-policy': 'sandbox',
		},
	});
};
