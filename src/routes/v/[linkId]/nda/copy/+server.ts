import { error } from '@sveltejs/kit';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { ndaVersion } from '#lib/server/viewer/gates.ts';
import { ndaCopyResponse } from '#lib/server/viewer/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
	const ctx = requireViewer(event, { allowNda: true });
	const nda = ndaVersion(ctx.needsNda ? ctx.room.current_nda_version_id : ctx.session.nda_version_id);
	if (!nda) error(404, 'There is no NDA for this room.');
	return ndaCopyResponse(ctx.room.name, nda);
};
