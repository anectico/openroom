import { database } from '#lib/server/db/index.ts';
import { documentReviewStates } from '#lib/server/document-reviews.ts';
import { documentChanges } from '#lib/server/investor-attention.ts';
import { renderMarkdown } from '#lib/server/markdown.ts';
import { visiblePins } from '#lib/server/pins.ts';
import { requestSummaries } from '#lib/server/requests.ts';
import { sha256 } from '#lib/server/secrets.ts';
import { visibleTree } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const ctx = requireViewer(event);
	const faq = (
		database()
			.sqlite.prepare(
				'SELECT id, question, answer_markdown FROM faq_entries WHERE room_id = ? ORDER BY position',
			)
			.all(ctx.room.id) as { id: string; question: string; answer_markdown: string }[]
	).map((f) => ({ id: f.id, question: f.question, answerHtml: renderMarkdown(f.answer_markdown) }));
	const requests = requestSummaries(ctx);
	const changes = documentChanges(ctx, visibleTree(ctx.room.id, ctx.link.id));
	const tree = changes.tree;
	const reviewStates = documentReviewStates(ctx, visiblePins(ctx.room.id, tree));
	return {
		welcomeHtml: renderMarkdown(ctx.link.welcome_markdown ?? ctx.room.welcome_markdown),
		welcomeRevision: sha256(ctx.link.welcome_markdown ?? ctx.room.welcome_markdown),
		reviewedIds: reviewStates.filter((state) => state.reviewed).map((state) => state.fileId),
		reviewStates,
		personalWelcome: ctx.link.welcome_markdown !== null,
		pins: visiblePins(ctx.room.id, tree),
		tree,
		changesSince: changes.since,
		faq,
		requests,
	};
};
