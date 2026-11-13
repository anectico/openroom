import { fileVisible } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { sameOrigin } from '#lib/server/viewer/http.ts';
import { hit, limits } from '#lib/server/viewer/ratelimit.ts';
import { recordBeacon } from '#lib/server/viewer/tracking.ts';
import type { RequestHandler } from './$types';

const noContent = () => new Response(null, { status: 204 });

export const POST: RequestHandler = async (event) => {
	if (!sameOrigin(event.request, event.url)) return new Response(null, { status: 403 });
	let ctx = requireViewer(event);
	if (!hit(`beacon:${ctx.session.id}`, limits.beacon.max, limits.beacon.windowMs)) return noContent();
	const text = await event.request.text();
	if (text.length > 32_000) return noContent();
	let beacon: unknown;
	try {
		beacon = JSON.parse(text);
	} catch {
		return noContent();
	}
	ctx = requireViewer(event);
	recordBeacon(ctx, beacon, (fileId) => fileVisible(ctx.room.id, ctx.link.id, fileId));
	return noContent();
};
