import { error } from '@sveltejs/kit';
import { database } from '#lib/server/db/index.ts';
import { serveVersion } from '#lib/server/viewer/serve.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals, url, request }) => {
	if (!locals.member) error(401, 'Sign in again.');
	const wanted = url.searchParams.get('version');
	const version = database()
		.sqlite.prepare(
			`SELECT v.object_key, v.content_type, v.original_name, v.size, f.kind FROM files f
			JOIN file_versions v ON v.file_id = f.id AND v.version = coalesce(?, f.current_version)
			WHERE f.id = ? AND f.room_id = ?`,
		)
		.get(wanted ? Number(wanted) : null, params.fileId, params.roomId) as
		| Parameters<typeof serveVersion>[0]
		| undefined;
	if (!version) error(404, 'Not found');
	return serveVersion(
		version,
		request,
		url.searchParams.get('download') === '1' || version.kind === 'download',
	);
};
