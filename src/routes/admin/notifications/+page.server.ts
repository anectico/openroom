import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	notices: (
		await runOp<{
			notices: {
				id: number;
				text: string;
				href: string;
				createdAt: number;
				read: boolean;
				roomId: string | null;
				viewerId: string | null;
			}[];
		}>(locals, 'list_notices', { limit: 200 })
	).notices,
});
