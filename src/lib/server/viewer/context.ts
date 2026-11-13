import { error, redirect } from '@sveltejs/kit';
import { checkSession, sessionCookie } from './access.ts';

type Event = { params: { linkId: string }; cookies: { get(name: string): string | undefined }; url: URL };

export function requireViewer(event: Event, options: { allowNda?: boolean } = {}) {
	const check = checkSession(event.params.linkId, event.cookies.get(sessionCookie(event.params.linkId)));
	if (!check.ok) error(check.reason === 'no_session' ? 401 : 404, check.reason);
	if (check.ctx.needsNda && !options.allowNda)
		redirect(303, `/v/${event.params.linkId}/nda?next=${encodeURIComponent(event.url.pathname)}`);
	return check.ctx;
}
