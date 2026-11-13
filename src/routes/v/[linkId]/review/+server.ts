import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { setDocumentReviewed } from '#lib/server/document-reviews.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { sameOrigin } from '#lib/server/viewer/http.ts';
import { hit } from '#lib/server/viewer/ratelimit.ts';
import type { RequestHandler } from './$types';

const input = z.object({
	fileId: z.string().min(1).max(100),
	version: z.number().int().positive(),
	reviewed: z.boolean(),
});
export const POST: RequestHandler = async (event) => {
	if (!sameOrigin(event.request, event.url)) return json({ error: 'Forbidden' }, { status: 403 });
	const body = input.safeParse(await event.request.json().catch(() => null));
	const ctx = requireViewer(event);
	if (!body.success) return json({ error: 'Invalid review.' }, { status: 400 });
	if (!hit(`review:${ctx.session.id}`, 120, 60 * 60_000))
		return json({ error: 'Too many updates. Try again later.' }, { status: 429 });
	const result = setDocumentReviewed(ctx, body.data.fileId, body.data.version, body.data.reviewed);
	if (result !== 'ok')
		return json(
			{
				error:
					result === 'changed'
						? 'This document has a new version. Reload before marking it reviewed.'
						: 'This document is no longer available in Start here.',
			},
			{ status: result === 'changed' ? 409 : 404 },
		);
	return json({ ok: true });
};
