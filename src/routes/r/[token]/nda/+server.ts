import { error } from '@sveltejs/kit';
import { findRoom } from '#lib/server/rooms.ts';
import { effectiveSettings, linkByToken } from '#lib/server/viewer/access.ts';
import { gateCookie, loadGate, ndaVersion, nextStep } from '#lib/server/viewer/gates.ts';
import { ndaCopyResponse } from '#lib/server/viewer/http.ts';
import { hit, ipKey, limits } from '#lib/server/viewer/ratelimit.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies, getClientAddress }) => {
	if (!hit(`token:${ipKey(getClientAddress())}`, limits.tokenLookup.max, limits.tokenLookup.windowMs))
		error(429, 'Too many requests. Wait a minute and try again.');
	const link = linkByToken(params.token);
	const room = link ? findRoom(link.room_id) : undefined;
	if (!link || !room) error(404, 'This link is not available.');
	const gate = loadGate(link, cookies.get(gateCookie(link.id)));
	if (!gate || nextStep(link, effectiveSettings(link, room), gate) !== 'nda')
		error(404, 'Your sign-in timed out. Open your invitation link again.');
	const nda = ndaVersion(room.current_nda_version_id);
	if (!nda) error(404, 'This NDA is not available.');
	return ndaCopyResponse(room.name, nda);
};
