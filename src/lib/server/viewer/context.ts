import { error, redirect } from '@sveltejs/kit';
import { checkSession, sessionCookie } from './access.ts';
import { cookieOptions } from './http.ts';

type Event = {
	params: { linkId: string };
	cookies: { get(name: string): string | undefined };
	url: URL;
	request: Request;
};

type Cookies = {
	get(name: string): string | undefined;
	set(name: string, value: string, options: ReturnType<typeof cookieOptions>): void;
	delete(name: string, options: { path: string; secure?: boolean }): void;
};

export const returnCookie = (linkId: string) => `on_${linkId}`;
const returnTtlSeconds = 60 * 60;
const maxReturnLength = 300;

export function safeRoomPath(linkId: string, value: string | null | undefined) {
	if (!value || value.length > maxReturnLength || !/^lnk_[a-z0-9]{8,40}$/.test(linkId)) return null;
	const pattern = /^\/v\/(lnk_[a-z0-9]{8,40})(\/[A-Za-z0-9_-]+)+\/?(\?[A-Za-z0-9_\-.=&]*)?$/;
	const match = pattern.exec(value);
	if (!match || match[1] !== linkId) return null;
	const path = value.split('?', 1)[0];
	if (/\/(signout|nda|beacon|ask|review|zip|files|preview)(\/|$)/.test(path.slice(linkId.length + 3)))
		return null;
	return value;
}

export function rememberRoomPath(event: Event & { cookies: Cookies }) {
	const path = safeRoomPath(event.params.linkId, event.url.pathname + event.url.search);
	if (path)
		event.cookies.set(returnCookie(event.params.linkId), path, cookieOptions(event.url, returnTtlSeconds));
}

export function takeRoomPath(cookies: Cookies, url: URL, linkId: string) {
	const path = safeRoomPath(linkId, cookies.get(returnCookie(linkId)));
	cookies.delete(returnCookie(linkId), { path: '/', secure: url.protocol === 'https:' });
	return path ?? `/v/${linkId}`;
}

export function requireViewer(
	event: Event & { cookies: Partial<Cookies> },
	options: { allowNda?: boolean; remember?: boolean } = {},
) {
	const check = checkSession(event.params.linkId, event.cookies.get(sessionCookie(event.params.linkId)));
	if (!check.ok) {
		if (check.reason === 'no_session') {
			if (options.remember && event.request.method === 'GET' && event.cookies.set && event.cookies.delete)
				rememberRoomPath(event as Event & { cookies: Cookies });
			error(401, 'Your session has ended. Open your invitation link and we’ll bring you back here.');
		}
		error(404, 'This link is not available. Ask the person who sent it to you for a new one.');
	}
	if (check.ctx.needsNda && !options.allowNda) {
		const next =
			event.request.method === 'GET' ? event.url.pathname + event.url.search : `/v/${event.params.linkId}`;
		redirect(303, `/v/${event.params.linkId}/nda?next=${encodeURIComponent(next)}`);
	}
	return check.ctx;
}
