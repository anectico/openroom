import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const themes = new Set(['light', 'dark', 'system']);

export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
	if (!locals.member) error(401, 'Sign in first.');
	const theme = (await request.text()).trim();
	if (!themes.has(theme)) error(400, 'Choose light, dark or system.');
	cookies.set('openroom_theme', theme, {
		path: '/admin',
		maxAge: 365 * 86_400,
		sameSite: 'lax',
		httpOnly: true,
		secure: url.protocol === 'https:',
	});
	return new Response(null, { status: 204 });
};
