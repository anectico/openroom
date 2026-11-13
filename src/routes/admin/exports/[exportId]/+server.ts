import { error, json } from '@sveltejs/kit';
import { exportStillValid, findExport } from '#lib/server/exports.ts';
import { serveFile } from '#lib/server/viewer/serve.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals, url, request }) => {
	if (!locals.member) error(401, 'Sign in again.');
	const row = findExport(params.exportId);
	if (!row || row.requested_by_user !== locals.member.id || row.expires_at < Date.now())
		error(404, 'Not found');
	if (url.searchParams.get('download') === '1') {
		if (row.status !== 'ready' || !row.object_key) error(409, 'The zip is not ready yet.');
		if (!exportStillValid(row)) error(410, 'The room changed since this zip was made. Make a new one.');
		return serveFile(row.object_key, row.file_name, request);
	}
	return json({ id: row.id, status: row.status, progress: row.progress, error: row.error });
};
