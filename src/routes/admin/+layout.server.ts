import { emailReady } from '#lib/server/email.ts';
import { runOp } from '#lib/server/http/admin.ts';
import { getSetting } from '#lib/server/settings.ts';
import type { systemStatus } from '#lib/server/system-health.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	depends('openroom:notifications');
	return {
		member: locals.member,
		notificationPreview: locals.member
			? await runOp<{
					unread: number;
					notices: { id: number; text: string; href: string; read: boolean; createdAt: number }[];
				}>(locals, 'list_notices', { limit: 5 })
			: { unread: 0, notices: [] },
		timeZone: getSetting('general.time_zone') ?? 'UTC',
		emailReady: emailReady(),
		system: locals.member ? await runOp<ReturnType<typeof systemStatus>>(locals, 'get_system_status') : null,
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
