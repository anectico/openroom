import { database } from '#lib/server/db/index.ts';
import { unreadReplies } from '#lib/server/investor-attention.ts';
import { viewerConversations } from '#lib/server/questions.ts';
import { visibleTree } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const ctx = requireViewer(event);
	const unread = unreadReplies(ctx);
	const files = visibleTree(ctx.room.id, ctx.link.id)
		.filter((n) => n.type === 'file')
		.map((n) => ({ id: n.id, name: n.name }));
	const titles = new Map(files.map((file) => [file.id, file.name]));
	const extra = database().sqlite.prepare(
		`SELECT (SELECT count(*) FROM messages m WHERE m.conversation_id = ?) - 1 AS replies,
			(SELECT body FROM messages m WHERE m.conversation_id = ? ORDER BY created_at LIMIT 1) AS first`,
	);
	return {
		verified: !!ctx.session.verified,
		files,
		threads: viewerConversations(ctx).map((c) => {
			const title = c.file_id ? titles.get(c.file_id) : null;
			const e = extra.get(c.id, c.id) as { replies: number; first: string };
			return {
				id: c.id,
				unread: unread.get(c.id) ?? 0,
				fileTitle: title ?? null,
				page: title ? c.page : null,
				replies: e.replies,
				first: e.first.slice(0, 200),
				at: c.last_message_at,
				status: c.last_author === 'member' ? 'Replied' : 'Awaiting answer',
			};
		}),
	};
};
