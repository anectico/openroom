import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	rooms: (
		await runOp<{
			rooms: {
				id: string;
				name: string;
				fileCount: number;
				activeLinkCount: number;
				viewersLast7Days: number;
			}[];
		}>(locals, 'list_rooms')
	).rooms,
	viewing: (
		await runOp<{
			viewing: {
				sessionId: string;
				viewerId: string;
				email: string | null;
				roomId: string;
				roomName: string;
				fileTitle: string | null;
			}[];
		}>(locals, 'get_viewing_now')
	).viewing,
	notices: (
		await runOp<{
			notices: {
				id: number;
				text: string;
				href: string;
				createdAt: number;
				read: boolean;
				roomId: string | null;
			}[];
		}>(locals, 'list_notices', { limit: 10 })
	).notices,
});
