import { requestFor, requestSummaries, uploadsFor } from '#lib/server/requests.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = (event) => {
	const ctx = requireViewer(event);
	const submittedId = event.url.searchParams.get('submitted');
	const submitted = submittedId ? requestFor(ctx, submittedId, true) : null;
	return {
		requests: requestSummaries(ctx),
		submittedRequestId: submitted && uploadsFor(ctx, submitted.id).length ? submitted.id : null,
	};
};
