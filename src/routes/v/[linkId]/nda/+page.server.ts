import { fail, redirect } from '@sveltejs/kit';
import { notify, recordEvent } from '#lib/server/activity.ts';
import { database } from '#lib/server/db/index.ts';
import { renderMarkdown } from '#lib/server/markdown.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { recordAcceptance } from '#lib/server/viewer/gates.ts';
import type { Actions, PageServerLoad } from './$types';

function safeNext(url: URL, linkId: string) {
	const next = url.searchParams.get('next') ?? '';
	return next.startsWith(`/v/${linkId}`) && !next.startsWith(`/v/${linkId}/nda`) ? next : `/v/${linkId}`;
}

export const load: PageServerLoad = (event) => {
	const ctx = requireViewer(event, { allowNda: true });
	if (!ctx.needsNda) redirect(303, safeNext(event.url, ctx.link.id));
	const nda = database()
		.sqlite.prepare('SELECT body_markdown, created_at FROM nda_versions WHERE id = ?')
		.get(ctx.room.current_nda_version_id) as { body_markdown: string; created_at: number };
	return {
		ndaHtml: renderMarkdown(nda.body_markdown),
		ndaDate: nda.created_at,
		ndaVersionId: ctx.room.current_nda_version_id,
		changed: !!ctx.session.nda_version_id,
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const ctx = requireViewer(event, { allowNda: true });
		if (!ctx.needsNda) redirect(303, safeNext(event.url, ctx.link.id));
		const name = String(form.get('name') ?? '')
			.trim()
			.slice(0, 120);
		if (!name || form.get('accept') !== 'on')
			return fail(400, { error: 'Type your name and tick “I accept” to continue.' });
		const version = ctx.room.current_nda_version_id;
		if (form.get('version') !== version)
			return fail(409, {
				error: 'The NDA changed while you were reading it. Read the new version and accept again.',
			});
		if (version && ctx.email) {
			const sqlite = database().sqlite;
			sqlite
				.transaction(() => {
					recordAcceptance({
						viewerId: ctx.session.viewer_id,
						sessionId: ctx.session.id,
						verified: !!ctx.session.verified,
						linkId: ctx.link.id,
						roomId: ctx.room.id,
						ndaVersionId: version,
						name,
						email: ctx.email as string,
						ip: event.getClientAddress(),
						userAgent: event.request.headers.get('user-agent'),
					});
					sqlite
						.prepare('UPDATE viewer_sessions SET nda_version_id = ? WHERE id = ?')
						.run(version, ctx.session.id);
				})
				.immediate();
			const base = { roomId: ctx.room.id, linkId: ctx.link.id, viewerId: ctx.session.viewer_id };
			recordEvent({ ...base, kind: 'nda_accepted', sessionId: ctx.session.id });
			notify('nda_accepted', base);
		}
		redirect(303, safeNext(event.url, ctx.link.id));
	},
};
