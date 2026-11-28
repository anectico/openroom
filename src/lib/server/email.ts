import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { database } from './db/index.ts';
import type { Message } from './email-copy.ts';
import { enqueue } from './jobs.ts';
import { getSecretSetting, getSetting, setSetting } from './settings.ts';
import { linkByToken, mayEnter } from './viewer/access.ts';
import { queueWebhooks } from './webhooks.ts';

export const cloudflareAccountIdPattern = /^[a-f0-9]{32}$/i;

export type EmailConfig =
	| { provider: 'cloudflare'; from: string; accountId: string; apiToken: string; source: 'env' | 'settings' }
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
			port: Number(process.env.SMTP_PORT || 587),
			user: process.env.SMTP_USER || null,
			password: process.env.SMTP_PASSWORD || null,
			source: 'env',
		};
	const accountId = process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
	if (accountId && cloudflareAccountIdPattern.test(accountId) && apiToken)
		return { provider: 'cloudflare', from, accountId, apiToken, source: 'env' };
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
	if (provider === 'cloudflare') {
		const accountId = getSetting('email.cloudflare_account_id');
		const apiToken = getSecretSetting('email.cloudflare_token');
		return accountId && apiToken ? { provider, from, accountId, apiToken, source: 'settings' } : null;
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
	const notice = sqlite
		.prepare('INSERT INTO notices (event, detail_json, created_at) VALUES (?, ?, ?)')
		.run('email_cap', JSON.stringify({ cap: dailyCap() }), Date.now());
	queueWebhooks(Number(notice.lastInsertRowid), 'email_cap');
	enqueue('notices.cap_email', {});
}

export function codesLastDay() {
	return countLastDay(['email.code']);
}

export function sentLastDay() {
	return countLastDay(['email.send', 'email.reset', 'email.code', 'email.notice']);
}

export function recordSent(kind: EmailKind) {
	const now = Date.now();
	database()
		.sqlite.prepare(
			'INSERT INTO jobs (kind, payload, run_at, max_attempts, created_at, done_at) VALUES (?, ?, ?, ?, ?, ?)',
		)
		.run(kind, '{}', now, 1, now, now);
}

async function sendCloudflare(
	config: Extract<EmailConfig, { provider: 'cloudflare' }>,
	to: string,
	message: Message,
) {
	const mailbox = config.from.match(/^(.*?)\s*<([^>]+)>\s*$/);
	const from = mailbox?.[1] ? { address: mailbox[2], name: mailbox[1] } : (mailbox?.[2] ?? config.from);
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from, to, subject: message.subject, text: message.text }),
			redirect: 'error',
			signal: AbortSignal.timeout(15_000),
		},
	).catch(() => {
		throw new EmailError('Could not submit the email to Cloudflare. Check the connection and API token.');
	});
	const body = await response.json().catch(() => null);
	if (!response.ok || body?.success !== true) {
		const code = body?.errors?.[0]?.code;
		throw new EmailError(
			`Cloudflare refused the email (HTTP ${response.status}${typeof code === 'number' ? `, code ${code}` : ''}). See Email Sending in your Cloudflare dashboard.`,
		);
	}
	const result = body.result;
	if (result?.permanent_bounces?.length || result?.suppressed_recipients?.length)
		throw new EmailError('Cloudflare reported that the recipient bounced or is suppressed.');
	if (
		![...(result?.delivered ?? []), ...(result?.queued ?? [])].some(
			(address: string) => address.toLowerCase() === to.toLowerCase(),
		)
	)
		throw new EmailError('Cloudflare did not confirm acceptance of the email.');
}

export async function deliver(config: EmailConfig, to: string, raw: Message) {
	const message = { ...raw, subject: raw.subject.replace(/[\r\n]+/g, ' ').trim() };
	try {
		if (config.provider === 'resend') {
			const { error } = await new Resend(config.apiKey).emails.send({
				from: config.from,
				to,
				subject: message.subject,
				text: message.text,
			});
			if (error) throw new EmailError(`Resend refused the email: ${error.message}`);
		} else if (config.provider === 'cloudflare') {
			await sendCloudflare(config, to, message);
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

type QueuedMessage = Message & {
	conversationId?: string;
	noticeId?: number;
	memberId?: string;
	requestId?: string;
	linkId?: string;
	inviteToken?: string;
};

export function sendEmail(to: string, message: QueuedMessage, kind: EmailKind = 'email.send') {
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

export async function runEmailJob(payload: unknown, kind: EmailKind = 'email.send') {
	const p = payload as QueuedMessage & { to: string };
	const db = database().sqlite;
	if (kind === 'email.notice') {
		const { emailWanted } = await import('./activity.ts');
		const member = db
			.prepare(`SELECT id, role FROM user WHERE email = ? AND removed_at IS NULL AND
			EXISTS (SELECT 1 FROM account WHERE user_id = user.id AND provider_id = 'credential')`)
			.get(p.to) as { id: string; role: string } | undefined;
		if (!member || (p.memberId && p.memberId !== member.id)) return;
		if (p.noticeId !== undefined) {
			const notice = db.prepare('SELECT event FROM notices WHERE id = ?').get(p.noticeId) as
				| { event: string }
				| undefined;
			if (!notice || !emailWanted(member.id, member.role, notice.event)) return;
		}
	}
	if (kind === 'email.send') {
		const inviteToken =
			p.inviteToken ??
			p.text.match(/\nhttps?:\/\/[^\s/]+\/r\/([\w-]+)\n\nThe room records which pages you view\.$/)?.[1];
		if (inviteToken) {
			const link = linkByToken(inviteToken);
			if (
				!link ||
				!mayEnter(link, p.to) ||
				!db
					.prepare("SELECT 1 FROM link_allow WHERE link_id = ? AND kind = 'email' AND value = ?")
					.get(link.id, p.to)
			)
				return;
		}
		const oldRequest =
			!p.requestId && p.subject.startsWith('File requested in ')
				? p.text.match(/\/v\/([\w-]+)\/requests\/([\w-]+)$/)
				: null;
		if (p.requestId || oldRequest) {
			const { mayEmailRequest } = await import('./requests.ts');
			if (!mayEmailRequest(p.requestId ?? oldRequest?.[2] ?? '', p.linkId ?? oldRequest?.[1] ?? '', p.to))
				return;
		}
	}
	if (
		p.conversationId ||
		(kind === 'email.send' && p.subject.startsWith('New answer to your question in '))
	) {
		const id = p.conversationId ?? p.text.match(/\/questions\/(conv_[a-z0-9]+)$/)?.[1];
		const { replyRecipient } = await import('./questions.ts');
		if (!id || replyRecipient(id) !== p.to) return;
	}
	const config = emailConfig();
	if (!config) throw new EmailError('Email is no longer set up.');
	await deliver(config, p.to, { subject: p.subject, text: p.text });
}
