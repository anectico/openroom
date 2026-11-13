import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { json } from '@sveltejs/kit';
import { receiveUpload } from '#lib/server/uploads.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request }) => {
	const result = await receiveUpload(params.token, {
		method: request.method,
		contentType: request.headers.get('content-type'),
		contentLength: request.headers.get('content-length'),
		body: request.body ? Readable.fromWeb(request.body as NodeReadableStream) : Readable.from([]),
	});
	return json(result.body, { status: result.status });
};
