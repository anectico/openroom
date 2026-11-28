import type { attention } from '#lib/server/attention.ts';
import { emailReady } from '#lib/server/email.ts';
import { runOp } from '#lib/server/http/admin.ts';
import { getSetting } from '#lib/server/settings.ts';
import type { systemStatus } from '#lib/server/system-health.ts';
import type { LayoutServerLoad } from './$types';

export type Theme = 'light' | 'dark' | 'system';

export const load: LayoutServerLoad = async ({ locals, depends, cookies }) => {
	depends('openroom:notifications');
	const saved = cookies.get('openroom_theme');
	return {
		member: locals.member,
		theme: (saved === 'light' || saved === 'dark' ? saved : 'system') as Theme,
		notificationPreview: locals.member
			? await runOp<{
					unread: number;
					notices: { id: number; text: string; href: string; read: boolean; createdAt: number }[];
				}>(locals, 'list_notices', { limit: 5 })
			: { unread: 0, notices: [] },
		timeZone: getSetting('general.time_zone') ?? 'UTC',
		emailReady: emailReady(),
		system: locals.member ? await runOp<ReturnType<typeof systemStatus>>(locals, 'get_system_status') : null,
		attention: locals.member ? await runOp<ReturnType<typeof attention>>(locals, 'get_attention') : null,
		sidebarRooms: locals.member
			? (
					await runOp<{ rooms: { id: string; name: string; frozenAt: number | null }[] }>(
						locals,
						'list_rooms',
					)
				).rooms
			: [],
	};
};
