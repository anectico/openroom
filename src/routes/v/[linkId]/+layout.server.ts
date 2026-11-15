import { brandingFor } from '#lib/server/branding.ts';
import { unreadReplies } from '#lib/server/investor-attention.ts';
import { requestSummaries } from '#lib/server/requests.ts';
import { sha256 } from '#lib/server/secrets.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { renderWelcome } from '#lib/welcome-markdown.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	const ctx = requireViewer(event, { allowNda: event.route.id === '/v/[linkId]/nda' });
	const markdown = ctx.link.welcome_markdown ?? ctx.room.welcome_markdown;
	const branding = brandingFor(ctx.room);
	const welcome =
		!ctx.needsNda && markdown.trim()
			? {
					html: renderWelcome(markdown),
					storageKey: `openroom:welcome-dismissed:${sha256(`${ctx.link.id}:${ctx.preview ? ctx.session.id : ctx.session.viewer_id}`)}`,
				}
			: null;
	return {
		welcome,
		coverOnly:
			!ctx.needsNda && !markdown.trim() && event.route.id !== '/v/[linkId]/view/[fileId]'
				? branding.coverUrl
				: null,
		actionRequests: ctx.needsNda
			? 0
			: requestSummaries(ctx).filter((r) => r.status === 'Action needed').length,
		linkId: ctx.link.id,
		unreadReplies: ctx.needsNda ? 0 : [...unreadReplies(ctx).values()].reduce((sum, n) => sum + n, 0),
		readingScope: sha256(`reading:${ctx.session.id}`),
		roomId: ctx.room.id,
		roomName: ctx.room.name,
		email: ctx.email,
		preview: ctx.preview,
		downloads: ctx.settings.downloads,
		branding,
	};
};
