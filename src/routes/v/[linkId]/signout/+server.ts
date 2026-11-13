import { redirect } from '@sveltejs/kit';
import { checkSession, endSession, sessionCookie } from '#lib/server/viewer/access.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, cookies, url }) => {
	const check = checkSession(params.linkId, cookies.get(sessionCookie(params.linkId)));
	if (check.ok) endSession(check.ctx.session.id);
	cookies.delete(sessionCookie(params.linkId), { path: '/', secure: url.protocol === 'https:' });
	redirect(303, `/v/${params.linkId}`);
};
