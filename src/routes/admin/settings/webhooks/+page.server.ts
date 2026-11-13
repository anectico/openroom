import { redirect } from '@sveltejs/kit';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Hook = {
	id: string;
	format: 'generic' | 'slack';
	host: string;
	enabled: boolean;
	lastStatus: number | null;
	lastError: string | null;
	lastSentAt: number | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.member?.role !== 'owner') redirect(303, '/admin/settings/api-keys');
	return { webhooks: (await runOp<{ webhooks: Hook[] }>(locals, 'list_webhooks')).webhooks };
};
