import { json } from '@sveltejs/kit';
import { askQuestion, cleanBody } from '#lib/server/questions.ts';
import { fileVisible } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { sameOrigin } from '#lib/server/viewer/http.ts';
import { hit } from '#lib/server/viewer/ratelimit.ts';
import { currentVersionId } from '#lib/server/viewer/serve.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	if (!sameOrigin(event.request, event.url)) return json({ error: 'Forbidden' }, { status: 403 });
	let ctx = requireViewer(event);
	if (ctx.preview) return json({ error: 'Previews cannot ask questions.' }, { status: 403 });
	if (!hit(`ask:${ctx.session.id}`, 20, 60 * 60_000))
		return json({ error: 'Too many questions. Try again later.' }, { status: 429 });
	const raw = (await event.request.json().catch(() => null)) as {
		fileId?: unknown;
		page?: unknown;
		body?: unknown;
	} | null;
	ctx = requireViewer(event);
	const body = cleanBody(raw?.body);
	if (!body) return json({ error: 'Write your question first.' }, { status: 400 });
	if (
		raw?.fileId != null &&
		(typeof raw.fileId !== 'string' || !fileVisible(ctx.room.id, ctx.link.id, raw.fileId))
	)
		return json(
			{ error: 'That document is no longer available. Choose another document or ask about the room.' },
			{ status: 400 },
		);
	const fileId = typeof raw?.fileId === 'string' ? raw.fileId : null;
	const page = raw?.page ?? null;
	if (page !== null) {
		const version = fileId ? currentVersionId(fileId) : null;
		if (
			typeof page !== 'number' ||
			!Number.isSafeInteger(page) ||
			page < 1 ||
			version?.kind !== 'pdf' ||
			(version.pages !== null && page > version.pages)
		)
			return json({ error: 'Choose a page in this PDF.' }, { status: 400 });
	}
	const id = askQuestion(ctx, { fileId, page, body });
	return json({ id });
};
