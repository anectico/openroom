import { json } from '@sveltejs/kit';
import { verifyBearer } from '#lib/server/api-keys.ts';
import { exportStillValid, findExport } from '#lib/server/exports.ts';
import { serveFile } from '#lib/server/viewer/serve.ts';
import type { RequestHandler } from './$types';

const fail = (status: number, code: string, message: string) =>
	json({ error: { code, message } }, { status });

export const GET: RequestHandler = async ({ params, request }) => {
	const owner = await verifyBearer(request.headers.get('authorization'));
	if (!owner) return fail(401, 'unauthorized', 'Send a valid API key as Authorization: Bearer <key>.');
	const row = findExport(params.exportId);
	if (!row || row.requested_by_user !== owner.userId || row.expires_at < Date.now())
		return fail(404, 'not_found', 'Export was not found.');
	if (row.status !== 'ready' || !row.object_key)
		return fail(409, 'not_ready', 'The export is not ready yet.');
	if (!exportStillValid(row))
		return fail(410, 'stale', 'The room changed since this zip was made. Make a new one.');
	return serveFile(row.object_key, row.file_name, request);
};
