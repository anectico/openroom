import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import { isLogoKey } from '#lib/server/branding.ts';
import { objectBytes, objectStream } from '#lib/server/storage.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	if (!isLogoKey(params.key)) error(404, 'Not found');
	const body =
		url.searchParams.get('icon') === '1'
			? new Uint8Array(
					await sharp(await objectBytes(params.key))
						.resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
						.png()
						.toBuffer(),
				)
			: (Readable.toWeb(await objectStream(params.key)) as ReadableStream);
	return new Response(body, {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'public, max-age=86400',
			'x-content-type-options': 'nosniff',
			'content-security-policy': 'sandbox',
		},
	});
};
