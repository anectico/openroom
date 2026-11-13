import { json } from '@sveltejs/kit';
import { verifyBearer } from '#lib/server/api-keys.ts';
import { requestUpload, serveRequestUpload } from '#lib/server/viewer/request-download.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	if (!(await verifyBearer(request.headers.get('authorization'))))
		return json(
			{ error: { code: 'unauthorized', message: 'Send a valid API key as Authorization: Bearer <key>.' } },
			{ status: 401 },
		);
	const row = requestUpload(params.uploadId);
	if (!row) return json({ error: { code: 'not_found', message: 'Upload was not found.' } }, { status: 404 });
	return serveRequestUpload(row, request);
};
