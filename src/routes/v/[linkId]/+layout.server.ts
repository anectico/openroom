import { brandingFor } from '#lib/server/branding.ts';
import { unreadReplies } from '#lib/server/investor-attention.ts';
import { renderMarkdown } from '#lib/server/markdown.ts';
import { requestSummaries } from '#lib/server/requests.ts';
import { sha256 } from '#lib/server/secrets.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	const ctx = requireViewer(event, { allowNda: event.route.id === '/v/[linkId]/nda' });
	let welcome = null;
	if (!ctx.needsNda && event.route.id !== '/v/[linkId]/view/[fileId]') {
		const markdown = ctx.link.welcome_markdown ?? ctx.room.welcome_markdown;
		const revision = sha256(markdown);
		const cookieName = ctx.preview
			? null
			: `openroom_welcome_${sha256(`${ctx.link.id}:${ctx.session.viewer_id}`)}`;
		const saved = cookieName ? event.cookies.get(cookieName) : undefined;
		welcome = {
			html: renderMarkdown(markdown),
			personal: ctx.link.welcome_markdown !== null,
			revision,
			cookieName,
			savedOpen: saved === `${revision}.open` ? true : saved === `${revision}.closed` ? false : null,
		};
	}
	return {
		welcome,
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
		branding: brandingFor(ctx.room),
	};
};
