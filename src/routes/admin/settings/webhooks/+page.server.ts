import { redirect } from '@sveltejs/kit';
import { noticeEvents } from '#lib/server/activity.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Hook = {
	id: string;
	format: 'generic' | 'slack';
	host: string;
	enabled: boolean;
	events: string[] | null;
	lastStatus: number | null;
	lastError: string | null;
	lastSentAt: number | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.member?.role !== 'owner') redirect(303, '/admin/settings/api-keys');
	return { noticeEvents, webhooks: (await runOp<{ webhooks: Hook[] }>(locals, 'list_webhooks')).webhooks };
};
