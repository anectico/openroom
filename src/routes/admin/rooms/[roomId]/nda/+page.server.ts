import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Version = { id: string; bodyMarkdown: string; createdAt: number; current: boolean; acceptances: number };

export const load: PageServerLoad = async ({ locals, params }) => {
	const nda = await runOp<{ versions: Version[]; requiredByActiveLinks: number }>(locals, 'get_nda', {
		roomId: params.roomId,
	});
	return { versions: nda.versions, requiredByActiveLinks: nda.requiredByActiveLinks };
};
