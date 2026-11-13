import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Group = { id: string; name: string; defaultAccess: 'view' | 'none'; linkCount: number };

export const load: PageServerLoad = async ({ locals, params }) => ({
	groups: (await runOp<{ groups: Group[] }>(locals, 'list_groups', { roomId: params.roomId })).groups,
});
