import { redirect } from '@sveltejs/kit';
import type { Branding } from '#lib/brand.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type General = { domain: string; timeZone: string; uploadMaxBytes: number; emailDailyCap: number };
type Email = {
	configured: boolean;
	source: 'env' | 'settings' | null;
	provider: 'resend' | 'smtp' | null;
	from: string | null;
	smtpHost: string | null;
	smtpPort: number | null;
	smtpUser: string | null;
	hasSecret: boolean;
	lastOkAt: number | null;
	lastError: string | null;
	dailyCap: number;
	sentLastDay: number;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.member?.role !== 'owner') redirect(303, '/admin/settings/api-keys');
	return {
		general: await runOp<General>(locals, 'get_general_settings'),
		email: await runOp<Email>(locals, 'get_email_settings'),
		timeZones: Intl.supportedValuesOf('timeZone'),
		branding: await runOp<Branding>(locals, 'get_branding'),
	};
};
