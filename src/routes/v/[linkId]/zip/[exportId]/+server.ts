import { error, json } from '@sveltejs/kit';
import { exportStillValid, findExport } from '#lib/server/exports.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { serveFile } from '#lib/server/viewer/serve.ts';
import { trackDownload } from '#lib/server/viewer/tracking.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const ctx = requireViewer(event);
	const row = findExport(event.params.exportId);
	if (!row || row.requested_by_session !== ctx.session.id || row.expires_at < Date.now())
		error(404, 'unavailable');
	if (ctx.settings.downloads !== 'zip') error(403, 'This link does not allow downloading a zip.');
	if (event.url.searchParams.get('download') === '1') {
		if (row.status !== 'ready' || !row.object_key) error(409, 'The zip is not ready yet.');
		if (!exportStillValid(row)) error(410, 'The room changed since this zip was made. Make a new one.');
		const response = await serveFile(row.object_key, row.file_name, event.request);
		if (event.request.method !== 'HEAD' && response.ok)
			trackDownload(ctx, null, true, event.request.headers.get('range'));
		return response;
	}
	return json({
		id: row.id,
		status: row.status,
		progress: row.progress,
		error: row.status === 'failed' ? row.error : null,
	});
};
