import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	prefs: (
		await runOp<{ prefs: { event: string; label: string; email: boolean }[] }>(
			locals,
			'get_notification_prefs',
		)
	).prefs,
});
