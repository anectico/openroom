import { error } from '@sveltejs/kit';
import { fileVisible } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { hit } from '#lib/server/viewer/ratelimit.ts';
import { currentVersion, serveVersion } from '#lib/server/viewer/serve.ts';
import { trackDownload } from '#lib/server/viewer/tracking.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const ctx = requireViewer(event);
	if (!fileVisible(ctx.room.id, ctx.link.id, event.params.fileId))
		error(404, 'This document is no longer shared with you.');
	const version = currentVersion(event.params.fileId);
	if (!version) error(404, 'This document is no longer shared with you.');
	const expected = event.url.searchParams.get('version');
	if (expected !== null && expected !== String(version.version))
		error(409, 'This document has a new version. Go back to the room and open it again.');
	const wantsDownload = event.url.searchParams.get('download') === '1';
	const isDownloadOnly = version.kind === 'download';
	if (wantsDownload && !isDownloadOnly && ctx.settings.downloads !== 'per_file')
		error(403, 'Downloads are turned off for this room. You can still read the document in the room.');
	const attachment = wantsDownload || isDownloadOnly;
	if (attachment) {
		if (!hit(`dl:${ctx.session.id}`, 120, 60_000))
			error(429, 'Too many downloads in a short time. Wait a minute and try again.');
	}
	const response = await serveVersion(version, event.request, attachment);
	if (attachment && event.request.method !== 'HEAD' && response.ok)
		trackDownload(ctx, event.params.fileId, false, event.request.headers.get('range'));
	return response;
};
