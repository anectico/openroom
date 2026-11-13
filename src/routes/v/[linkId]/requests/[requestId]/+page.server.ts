import { error } from '@sveltejs/kit';
import { requestFor, uploadsFor } from '#lib/server/requests.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const ctx = requireViewer(event);
	const r = requestFor(ctx, event.params.requestId, true);
	if (!r) error(404, 'unavailable');
	return {
		request: {
			id: r.id,
			title: r.title,
			description: r.description,
			maxSize: r.max_size,
			dueAt: r.due_at,
			closedAt: r.closed_at,
		},
		uploads: uploadsFor(ctx, r.id).map((u) => ({ ...u, late: !!u.late })),
		verified: !!ctx.session.verified,
	};
};
