import { json } from '@sveltejs/kit';
import { verifyBearer } from '#lib/server/api-keys.ts';
import { serveArchive } from '#lib/server/viewer/archive-download.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	if (!(await verifyBearer(request.headers.get('authorization'))))
		return json(
			{ error: { code: 'unauthorized', message: 'Send a valid API key as Authorization: Bearer <key>.' } },
			{ status: 401 },
		);
	return (
		serveArchive(params.roomId, request) ??
		json({ error: { code: 'not_ready', message: 'The archive is not ready.' } }, { status: 404 })
	);
};
