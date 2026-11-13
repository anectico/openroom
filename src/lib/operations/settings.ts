import { z } from 'zod';
import { dailyCap, deliver, EmailError, emailConfig, sentLastDay } from '../server/email.ts';
import { emailCopy } from '../server/email-copy.ts';
import { normaliseEmail } from '../server/emails.ts';
import { findMember } from '../server/members.ts';
import { publicOrigin } from '../server/origin.ts';
import {
	deleteSetting,
	getSecretSetting,
	getSetting,
	setSecretSetting,
	setSetting,
} from '../server/settings.ts';
import { defineOperation, OpError } from './define.ts';
import { maxUploadBytes } from './uploads.ts';

const emailStatus = z.object({
	configured: z.boolean(),
	source: z.enum(['env', 'settings']).nullable().describe('env means set by the server and read only here.'),
	provider: z.enum(['resend', 'smtp']).nullable(),
	from: z.string().nullable(),
	smtpHost: z.string().nullable(),
	smtpPort: z.number().nullable(),
	smtpUser: z.string().nullable(),
	hasSecret: z.boolean().describe('Whether an API key or password is saved. It is never shown again.'),
	lastOkAt: z.number().nullable(),
	lastError: z.string().nullable(),
	dailyCap: z.number(),
	sentLastDay: z.number(),
});

function status(): z.input<typeof emailStatus> {
	const c = emailConfig();
	const lastOk = getSetting('email.last_ok_at');
	return {
		configured: !!c,
		source: c?.source ?? null,
		provider: c?.provider ?? null,
		from: c?.from ?? null,
		smtpHost: c?.provider === 'smtp' ? c.host : null,
		smtpPort: c?.provider === 'smtp' ? c.port : null,
		smtpUser: c?.provider === 'smtp' ? c.user : null,
		hasSecret: c?.provider === 'resend' ? !!c.apiKey : !!(c?.provider === 'smtp' && c.password),
		lastOkAt: lastOk ? Number(lastOk) : null,
		lastError: getSetting('email.last_error'),
		dailyCap: dailyCap(),
		sentLastDay: sentLastDay(),
	};
}

export const getEmailSettings = defineOperation({
	name: 'get_email_settings',
	summary:
		'Show how email is set up, its last error and today’s count against the daily cap. Secrets are never shown.',
	role: 'owner',
	http: { method: 'GET', path: '/settings/email' },
	input: z.object({}),
	output: emailStatus,
	audit: false,
	run: () => status(),
});

const from = z
	.string()
	.trim()
	.min(3)
	.max(200)
	.describe('The sender, such as “Acme <rooms@acme.com>” or rooms@acme.com.')
	.refine((v) => normaliseEmail(v.match(/<([^>]+)>\s*$/)?.[1] ?? v) !== null, 'Not a valid sender email.')
	.refine((v) => !/[\r\n]/.test(v), 'No line breaks.');

export const updateEmailSettings = defineOperation({
	name: 'update_email_settings',
	summary:
		'Set up email with Resend (an API key) or any SMTP server, or provider: none to turn it off. Send a test with test_email afterwards.',
	role: 'owner',
	http: { method: 'PUT', path: '/settings/email' },
	input: z.discriminatedUnion('provider', [
		z.object({ provider: z.literal('resend'), from, apiKey: z.string().min(8).max(200).optional() }),
		z.object({
			provider: z.literal('smtp'),
			from,
			host: z.string().trim().min(1).max(253),
			port: z.number().int().min(1).max(65535).default(587),
			user: z.string().max(320).nullable().optional(),
			password: z.string().max(500).optional().describe('Left out keeps the saved password.'),
		}),
		z.object({ provider: z.literal('none') }),
	]),
	output: emailStatus,
	audit: { target: () => ({ type: 'settings', id: 'email' }), detail: (i) => ({ provider: i.provider }) },
	run: (input) => {
		if (emailConfig()?.source === 'env')
			throw new OpError(
				409,
				'set_by_server',
				'Email is set by the server’s environment and cannot change here.',
			);
		if (input.provider === 'none') {
			for (const k of [
				'provider',
				'from',
				'resend_key',
				'smtp_host',
				'smtp_port',
				'smtp_user',
				'smtp_password',
			])
				deleteSetting(`email.${k}`);
			return status();
		}
		if (input.provider === 'resend') {
			if (!input.apiKey && !getSecretSetting('email.resend_key'))
				throw new OpError(400, 'missing_key', 'Paste the Resend API key.');
			if (input.apiKey) setSecretSetting('email.resend_key', input.apiKey);
		} else {
			setSetting('email.smtp_host', input.host);
			setSetting('email.smtp_port', String(input.port));
			setSetting('email.smtp_user', input.user ?? null);
			if (input.password !== undefined) setSecretSetting('email.smtp_password', input.password);
		}
		setSetting('email.provider', input.provider);
		setSetting('email.from', input.from);
		setSetting('email.last_error', null);
		return status();
	},
});

export const testEmail = defineOperation({
	name: 'test_email',
	summary: 'Send a test email now, to you or to the address given, and report what the provider said.',
	role: 'owner',
	http: { method: 'POST', path: '/settings/email/test' },
	input: z.object({ to: z.string().optional() }),
	output: z.object({ sent: z.boolean(), to: z.string(), error: z.string().nullable() }),
	audit: { target: () => ({ type: 'settings', id: 'email' }), detail: (_i, o) => ({ sent: o.sent }) },
	run: async (input, ctx) => {
		const config = emailConfig();
		if (!config) throw new OpError(409, 'email_not_set_up', 'Set up email first.');
		const to = normaliseEmail(input.to ?? findMember(ctx.actor.userId)?.email ?? '');
		if (!to) throw new OpError(400, 'invalid_email', 'Give a valid email to send the test to.');
		try {
			await deliver(config, to, emailCopy.test({ origin: publicOrigin() }));
			return { sent: true, to, error: null };
		} catch (e) {
			return { sent: false, to, error: e instanceof EmailError ? e.message : String(e) };
		}
	},
});

const general = z.object({
	domain: z.string().describe('Read only; change it with openroom-server set-domain.'),
	timeZone: z.string().describe('IANA time zone for dates in the admin pages and emails.'),
	uploadMaxBytes: z.number(),
	emailDailyCap: z.number(),
});

function generalNow(): z.input<typeof general> {
	return {
		domain: new URL(publicOrigin()).host,
		timeZone: getSetting('general.time_zone') ?? 'UTC',
		uploadMaxBytes: maxUploadBytes(),
		emailDailyCap: dailyCap(),
	};
}

export const getGeneralSettings = defineOperation({
	name: 'get_general_settings',
	summary: 'Show the domain, time zone, upload size limit and email daily cap.',
	role: 'observer',
	http: { method: 'GET', path: '/settings/general' },
	input: z.object({}),
	output: general,
	audit: false,
	run: () => generalNow(),
});

export const updateGeneralSettings = defineOperation({
	name: 'update_general_settings',
	summary: 'Change the time zone, the upload size limit (bytes) or the email daily cap.',
	role: 'owner',
	http: { method: 'PATCH', path: '/settings/general' },
	input: z.object({
		timeZone: z
			.string()
			.refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz) || tz === 'UTC', 'Unknown time zone.')
			.optional(),
		uploadMaxBytes: z
			.number()
			.int()
			.min(1024 ** 2)
			.max(50 * 1024 ** 3)
			.optional(),
		emailDailyCap: z.number().int().min(1).max(100_000).optional(),
	}),
	output: general,
	audit: { target: () => ({ type: 'settings', id: 'general' }), detail: (i) => ({ fields: Object.keys(i) }) },
	run: (input) => {
		if (input.timeZone) setSetting('general.time_zone', input.timeZone);
		if (input.uploadMaxBytes) setSetting('uploads.max_bytes', String(input.uploadMaxBytes));
		if (input.emailDailyCap) setSetting('email.daily_cap', String(input.emailDailyCap));
		return generalNow();
	},
});
