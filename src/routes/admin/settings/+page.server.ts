import { redirect } from '@sveltejs/kit';
import type { Branding } from '#lib/brand.ts';
import type { EmailStatus } from '#lib/operations/settings.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type General = { domain: string; timeZone: string; uploadMaxBytes: number; emailDailyCap: number };

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.member?.role !== 'owner') redirect(303, '/admin/settings/api-keys');
	return {
		general: await runOp<General>(locals, 'get_general_settings'),
		email: await runOp<EmailStatus>(locals, 'get_email_settings'),
		timeZones: Intl.supportedValuesOf('timeZone'),
		branding: await runOp<Branding>(locals, 'get_branding'),
	};
};
