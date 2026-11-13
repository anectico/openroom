import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Version = { id: string; bodyMarkdown: string; createdAt: number; current: boolean; acceptances: number };

export const load: PageServerLoad = async ({ locals, params }) => ({
	versions: (await runOp<{ versions: Version[] }>(locals, 'get_nda', { roomId: params.roomId })).versions,
});
