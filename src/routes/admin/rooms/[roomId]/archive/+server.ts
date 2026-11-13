import { error } from '@sveltejs/kit';
import { serveArchive } from '#lib/server/viewer/archive-download.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals, request }) => {
	if (!locals.member) error(401, 'Sign in again.');
	return serveArchive(params.roomId, request) ?? error(404, 'The archive is not ready.');
};
