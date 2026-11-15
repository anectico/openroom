import { error, fail } from '@sveltejs/kit';
import { unreadMessageIds, unreadReplies } from '#lib/server/investor-attention.ts';
import { cleanBody, messagesOf, viewerConversation, viewerReply } from '#lib/server/questions.ts';
import { visibleTree } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { hit } from '#lib/server/viewer/ratelimit.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const ctx = requireViewer(event);
	const c = viewerConversation(ctx, event.params.conversationId);
	if (!c) error(404, 'unavailable');
	const file = c.file_id
		? visibleTree(ctx.room.id, ctx.link.id).find((n) => n.type === 'file' && n.id === c.file_id)
		: null;
	const unread = new Set(unreadMessageIds(ctx, c.id));
	return {
		thread: {
			unread: unreadReplies(ctx).get(c.id) ?? 0,
			id: c.id,
			fileId: file?.id ?? null,
			fileTitle: file?.name ?? null,
			page: file ? c.page : null,
		},
		messages: messagesOf(c.id).map((m) => ({
			id: m.id,
			unread: unread.has(m.id),
			mine: m.author === 'viewer',
			name: m.author === 'viewer' ? 'You' : (m.memberName ?? 'The team'),
			body: m.body,
			at: m.createdAt,
		})),
	};
};

export const actions: Actions = {
	default: async (event) => {
		const body = cleanBody((await event.request.formData()).get('body'));
		const ctx = requireViewer(event);
		const c = viewerConversation(ctx, event.params.conversationId);
		if (!c) error(404, 'unavailable');
		if (ctx.preview) return fail(403, { error: 'Previews cannot post messages.' });
		if (!hit(`ask:${ctx.session.id}`, 20, 60 * 60_000))
			return fail(429, { error: 'Too many messages. Try again later.' });
		if (!body) return fail(400, { error: 'Write a message first.' });
		viewerReply(ctx, c, body);
		return { sent: true };
	},
};
