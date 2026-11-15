import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('openroom:notifications');
	const unreadOnly = url.searchParams.get('view') === 'unread';
	const inbox = await runOp<{
		unread: number;
		notices: { id: number; event: string; text: string; href: string; createdAt: number; read: boolean }[];
	}>(locals, 'list_notices', { limit: 200, unreadOnly });
	return { ...inbox, unreadOnly };
};
