import { brandingFor } from '#lib/server/branding.ts';
import { unreadReplies } from '#lib/server/investor-attention.ts';
import { visiblePins } from '#lib/server/pins.ts';
import { requestSummaries } from '#lib/server/requests.ts';
import { sha256 } from '#lib/server/secrets.ts';
import { visibleTree } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { recordedFacts } from '#lib/server/viewer/tracking.ts';
import { documentHref } from '#lib/viewer/navigation.ts';
import { renderWelcome } from '#lib/welcome-markdown.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	const ctx = requireViewer(event, { allowNda: event.route.id === '/v/[linkId]/nda', remember: true });
	const markdown = ctx.link.welcome_markdown ?? ctx.room.welcome_markdown;
	const branding = brandingFor(ctx.room);
	const tree = ctx.needsNda ? [] : visibleTree(ctx.room.id, ctx.link.id);
	const readable = tree.filter((node) => node.type === 'file' && node.kind !== 'download');
	const pinned = visiblePins(ctx.room.id, tree).filter((node) => node.kind !== 'download');
	const start = pinned[0] ?? readable[0];
	const welcome: {
		html: string;
		storageKey: string;
		start?: { href: string; name: string } | null;
	} | null =
		!ctx.needsNda && markdown.trim()
			? {
					html: renderWelcome(markdown),
					storageKey: `openroom:welcome-dismissed:${sha256(`${ctx.link.id}:${ctx.preview ? ctx.session.id : ctx.session.viewer_id}`)}`,
					start: start
						? {
								href: documentHref(ctx.link.id, start.id, new URLSearchParams(), pinned[0] === start),
								name: start.name,
							}
						: null,
				}
			: null;
	const room: { records?: string[]; accessUntil?: number | null; ndaCopy?: boolean } = {
		records: recordedFacts(
			ctx.settings,
			tree.some((node) => node.kind === 'download'),
		),
		accessUntil: ctx.link.expires_at,
		ndaCopy: !ctx.needsNda && !!ctx.session.nda_version_id,
	};
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
		...room,
	};
};
