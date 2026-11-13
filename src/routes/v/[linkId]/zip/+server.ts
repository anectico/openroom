import { error, json } from '@sveltejs/kit';
import { createZipExport, ExportBusyError } from '#lib/server/exports.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { hit, ipKey } from '#lib/server/viewer/ratelimit.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
	const ctx = requireViewer(event);
	if (ctx.settings.downloads !== 'zip') error(403, 'This link does not allow downloading a zip.');
	if (!hit(`zip:${ipKey(event.getClientAddress())}`, 10, 60 * 60_000))
		return json({ error: 'Too many zips. Try again in an hour.' }, { status: 429 });
	let row: ReturnType<typeof createZipExport>;
	try {
		row = createZipExport({
			roomId: ctx.room.id,
			roomName: ctx.room.name,
			linkId: ctx.link.id,
			userId: null,
			sessionId: ctx.session.id,
		});
	} catch (e) {
		if (e instanceof ExportBusyError) return json({ error: e.message }, { status: 429 });
		throw e;
	}
	return json({ id: row.id, status: row.status, progress: row.progress });
};
