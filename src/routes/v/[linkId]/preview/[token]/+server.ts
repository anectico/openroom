import { error, redirect } from '@sveltejs/kit';
import { checkSession, sessionCookie } from '#lib/server/viewer/access.ts';
import { cookieOptions } from '#lib/server/viewer/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies, url }) => {
	const check = checkSession(params.linkId, params.token);
	if (!check.ok || !check.ctx.preview) error(404, 'unavailable');
	cookies.set(sessionCookie(params.linkId), params.token, cookieOptions(url, 60 * 60));
	redirect(303, `/v/${params.linkId}`);
};
