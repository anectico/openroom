import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Room = {
	id: string;
	name: string;
	fileCount: number;
	activeLinkCount: number;
	viewersLast7Days: number;
	frozenAt: number | null;
};

export const load: PageServerLoad = async ({ locals }) => ({
	rooms: (await runOp<{ rooms: Room[] }>(locals, 'list_rooms')).rooms,
});
