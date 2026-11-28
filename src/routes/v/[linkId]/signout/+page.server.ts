import { redirect } from '@sveltejs/kit';
import { brandingFor } from '#lib/server/branding.ts';
import { findRoom } from '#lib/server/rooms.ts';
import { checkSession, endSession, linkById, sessionCookie } from '#lib/server/viewer/access.ts';
import { returnCookie } from '#lib/server/viewer/context.ts';
import { clearCookie, cookieOptions } from '#lib/server/viewer/http.ts';
import type { Actions, PageServerLoad } from './$types';

const signedOutCookie = (linkId: string) => `os_${linkId}`;

export const load: PageServerLoad = ({ params, cookies }) => {
	const signedOut = cookies.get(signedOutCookie(params.linkId)) === '1';
	const link = signedOut ? linkById(params.linkId) : undefined;
	const room = link ? findRoom(link.room_id) : undefined;
	return {
		roomName: room?.name ?? null,
		branding: brandingFor(room ?? null),
	};
};

export const actions: Actions = {
	default: ({ params, cookies, url }) => {
		const check = checkSession(params.linkId, cookies.get(sessionCookie(params.linkId)));
		if (check.ok) endSession(check.ctx.session.id);
		clearCookie(cookies, sessionCookie(params.linkId), url);
		clearCookie(cookies, returnCookie(params.linkId), url);
		if (check.ok) cookies.set(signedOutCookie(params.linkId), '1', cookieOptions(url, 10 * 60));
		redirect(303, `/v/${params.linkId}/signout`);
	},
};
