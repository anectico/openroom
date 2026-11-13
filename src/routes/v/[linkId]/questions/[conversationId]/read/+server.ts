import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { markRepliesRead } from '#lib/server/investor-attention.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { sameOrigin } from '#lib/server/viewer/http.ts';
import type { RequestHandler } from './$types';

const input = z.object({ messageIds: z.array(z.string().max(100)).max(200) });

export const POST: RequestHandler = async (event) => {
	if (!sameOrigin(event.request, event.url)) return json({ error: 'Forbidden' }, { status: 403 });
	const body = input.safeParse(await event.request.json().catch(() => null));
	const ctx = requireViewer(event);
	if (!body.success) return json({ error: 'Invalid messages.' }, { status: 400 });
	if (!markRepliesRead(ctx, event.params.conversationId, body.data.messageIds))
		return json({ error: 'Unavailable' }, { status: 404 });
	return json({ ok: true });
};
