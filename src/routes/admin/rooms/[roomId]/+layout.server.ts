import type { Room } from '#lib/admin/types.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const room = await runOp<Room>(locals, 'get_room', { roomId: params.roomId });
	const archive = room.frozenAt
		? await runOp<{ status: string; progress: number; downloadUrl: string | null; keptUntil: number | null }>(
				locals,
				'get_room_archive',
				{ roomId: params.roomId },
			)
		: null;
	return { room, archive };
};
