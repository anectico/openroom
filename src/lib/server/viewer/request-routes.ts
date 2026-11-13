import { error, json } from '@sveltejs/kit';
import { requestFor } from '../requests.ts';
import { requireViewer } from './context.ts';
import { sameOrigin } from './http.ts';
import { hit } from './ratelimit.ts';

type Event = Parameters<typeof requireViewer>[0] & {
	params: { linkId: string; requestId: string };
	request: Request;
	url: URL;
};

export function requestContext(event: Event) {
	if (!sameOrigin(event.request, event.url)) error(403, 'Forbidden');
	const ctx = requireViewer(event);
	const request = requestFor(ctx, event.params.requestId);
	if (!request) error(404, 'This request is closed or no longer open to you.');
	if (!hit(`req-upload:${ctx.session.id}`, 40, 60 * 60_000)) error(429, 'Too many uploads. Try again later.');
	return { ctx, request };
}

export const failJson = (status: number, message: string) => json({ error: message }, { status });
