import { error, redirect } from '@sveltejs/kit';
import { checkSession, sessionCookie } from './access.ts';

type Event = {
	params: { linkId: string };
	cookies: { get(name: string): string | undefined };
	url: URL;
	request: Request;
};

export function requireViewer(event: Event, options: { allowNda?: boolean } = {}) {
	const check = checkSession(event.params.linkId, event.cookies.get(sessionCookie(event.params.linkId)));
	if (!check.ok) error(check.reason === 'no_session' ? 401 : 404, check.reason);
	if (check.ctx.needsNda && !options.allowNda) {
		const next =
			event.request.method === 'GET' ? event.url.pathname + event.url.search : `/v/${event.params.linkId}`;
		redirect(303, `/v/${event.params.linkId}/nda?next=${encodeURIComponent(next)}`);
	}
	return check.ctx;
}
