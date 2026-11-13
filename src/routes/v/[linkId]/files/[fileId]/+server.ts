import { error } from '@sveltejs/kit';
import { fileVisible } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { hit } from '#lib/server/viewer/ratelimit.ts';
import { currentVersion, serveVersion } from '#lib/server/viewer/serve.ts';
import { trackDownload } from '#lib/server/viewer/tracking.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const ctx = requireViewer(event);
	if (!fileVisible(ctx.room.id, ctx.link.id, event.params.fileId)) error(404, 'unavailable');
	const version = currentVersion(event.params.fileId);
	if (!version) error(404, 'unavailable');
	const wantsDownload = event.url.searchParams.get('download') === '1';
	const isDownloadOnly = version.kind === 'download';
	if (wantsDownload && !isDownloadOnly && ctx.settings.downloads !== 'per_file')
		error(403, 'Downloads are off for this link.');
	const attachment = wantsDownload || isDownloadOnly;
	if (attachment) {
		if (!hit(`dl:${ctx.session.id}`, 120, 60_000)) error(429, 'Too many downloads. Wait a minute.');
	}
	const response = await serveVersion(version, event.request, attachment);
	if (attachment && event.request.method !== 'HEAD' && response.ok)
		trackDownload(ctx, event.params.fileId, false, event.request.headers.get('range'));
	return response;
};
