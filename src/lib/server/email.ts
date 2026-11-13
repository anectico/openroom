import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { database } from './db/index.ts';
import type { Message } from './email-copy.ts';
import { enqueue } from './jobs.ts';
import { getSecretSetting, getSetting, setSetting } from './settings.ts';

export type EmailProvider = 'resend' | 'smtp';

export type EmailConfig =
	| { provider: 'resend'; from: string; apiKey: string; source: 'env' | 'settings' }
	| {
			provider: 'smtp';
			from: string;
			host: string;
			port: number;
			user: string | null;
			password: string | null;
			source: 'env' | 'settings';
	  };

export const defaultDailyCap = 90;

export class EmailError extends Error {}

function fromEnv(): EmailConfig | null {
	const from = process.env.EMAIL_FROM;
	if (!from) return null;
	if (process.env.RESEND_API_KEY)
		return { provider: 'resend', from, apiKey: process.env.RESEND_API_KEY, source: 'env' };
	if (process.env.SMTP_HOST)
		return {
			provider: 'smtp',
			from,
			host: process.env.SMTP_HOST,
			port: Number(process.env.SMTP_PORT ?? 587),
			user: process.env.SMTP_USER ?? null,
			password: process.env.SMTP_PASSWORD ?? null,
			source: 'env',
		};
	return null;
}

export function emailConfig(): EmailConfig | null {
	const env = fromEnv();
	if (env) return env;
	const provider = getSetting('email.provider');
	const from = getSetting('email.from');
	if (!from) return null;
	if (provider === 'resend') {
		const apiKey = getSecretSetting('email.resend_key');
		return apiKey ? { provider, from, apiKey, source: 'settings' } : null;
	}
	if (provider === 'smtp') {
		const host = getSetting('email.smtp_host');
		if (!host) return null;
		return {
			provider,
			from,
			host,
			port: Number(getSetting('email.smtp_port') ?? 587),
			user: getSetting('email.smtp_user'),
			password: getSecretSetting('email.smtp_password'),
			source: 'settings',
		};
	}
	return null;
}

export function emailReady() {
	return emailConfig() !== null;
}

export function dailyCap() {
	return Number(getSetting('email.daily_cap') ?? defaultDailyCap);
}

export const resetDailyCap = 20;

function countLastDay(kinds: string[]) {
	return (
		database()
			.sqlite.prepare(
				`SELECT count(*) AS n FROM jobs WHERE kind IN (${kinds.map(() => '?').join(',')}) AND created_at > ?`,
			)
			.get(...kinds, Date.now() - 86_400_000) as { n: number }
	).n;
}

export function scrubEmails(text: string) {
	return text.replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, '<address>');
}

export function capReached() {
	const sqlite = database().sqlite;
	if (
		sqlite
			.prepare("SELECT 1 FROM notices WHERE event = 'email_cap' AND created_at > ?")
			.get(Date.now() - 86_400_000)
	)
		return;
	sqlite
		.prepare('INSERT INTO notices (event, detail_json, created_at) VALUES (?, ?, ?)')
		.run('email_cap', JSON.stringify({ cap: dailyCap() }), Date.now());
	enqueue('notices.cap_email', {});
}

export function codesLastDay() {
	return countLastDay(['email.code']);
}

export function sentLastDay() {
	return countLastDay(['email.send', 'email.reset', 'email.code', 'email.notice']);
}

export async function deliver(config: EmailConfig, to: string, message: Message) {
	try {
		if (config.provider === 'resend') {
			const { error } = await new Resend(config.apiKey).emails.send({
				from: config.from,
				to,
				subject: message.subject,
				text: message.text,
			});
			if (error) throw new EmailError(`Resend refused the email: ${error.message}`);
		} else {
			const transport = nodemailer.createTransport({
				host: config.host,
				port: config.port,
				secure: config.port === 465,
				auth: config.user ? { user: config.user, pass: config.password ?? '' } : undefined,
				connectionTimeout: 15_000,
			});
			await transport.sendMail({ from: config.from, to, subject: message.subject, text: message.text });
		}
		setSetting('email.last_ok_at', String(Date.now()));
		setSetting('email.last_error', null);
	} catch (error) {
		const text = error instanceof Error ? error.message : String(error);
		const clean = scrubEmails(text);
		setSetting('email.last_error', clean.slice(0, 500));
		throw new EmailError(clean);
	}
}

export type EmailKind = 'email.send' | 'email.reset' | 'email.code' | 'email.notice';
const noticeShareOfCap = 0.3;

export function sendEmail(to: string, message: Message, kind: EmailKind = 'email.send') {
	if (!emailReady()) throw new EmailError('Email is not set up.');
	if (sentLastDay() >= dailyCap()) {
		capReached();
		throw new EmailError(
			`The daily email cap of ${dailyCap()} is reached; try again later or raise it in Settings.`,
		);
	}
	if (kind === 'email.notice' && countLastDay(['email.notice']) >= Math.floor(dailyCap() * noticeShareOfCap))
		throw new EmailError('The share of the daily cap for notices is used up.');
	if (kind === 'email.reset' && countLastDay(['email.reset']) >= resetDailyCap)
		throw new EmailError('Too many password reset emails today.');
	enqueue(kind, { to, ...message }, { maxAttempts: 5 });
}

export async function runEmailJob(payload: unknown) {
	const p = payload as { to: string } & Message;
	const config = emailConfig();
	if (!config) throw new EmailError('Email is no longer set up.');
	await deliver(config, p.to, { subject: p.subject, text: p.text });
}
