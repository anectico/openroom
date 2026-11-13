import type { Cookies } from '@sveltejs/kit';

export function cookieOptions(url: URL, maxAgeSeconds: number) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: url.protocol === 'https:',
		maxAge: maxAgeSeconds,
	};
}

export function clearCookie(cookies: Cookies, name: string, url: URL) {
	cookies.delete(name, { path: '/', secure: url.protocol === 'https:' });
}

export function maskEmail(email: string) {
	const [local, domain] = email.split('@');
	return `${local.slice(0, 2)}${local.length > 2 ? '…' : ''}@${domain}`;
}

export function sameOrigin(request: Request, url: URL) {
	const origin = request.headers.get('origin');
	if (origin) return origin === url.origin;
	const site = request.headers.get('sec-fetch-site');
	if (site) return site === 'same-origin';
	const referer = request.headers.get('referer');
	if (!referer) return false;
	try {
		return new URL(referer).origin === url.origin;
	} catch {
		return false;
	}
}
