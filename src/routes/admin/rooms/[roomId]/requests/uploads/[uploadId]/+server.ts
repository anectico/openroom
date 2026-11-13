import { error } from '@sveltejs/kit';
import { requestUpload, serveRequestUpload } from '#lib/server/viewer/request-download.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals, request }) => {
	if (!locals.member) error(401, 'Sign in again.');
	const row = requestUpload(params.uploadId);
	if (!row || row.room_id !== params.roomId) error(404, 'Not found');
	return serveRequestUpload(row, request);
};
