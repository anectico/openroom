import { z } from 'zod';
import { noticeEvents } from '../server/activity.ts';
import { database } from '../server/db/index.ts';
import { newId } from '../server/ids.ts';
import { checkUrl, OutboundError } from '../server/outbound.ts';
import { encrypt, randomToken } from '../server/secrets.ts';
import { sendWebhook, type WebhookRow } from '../server/webhooks.ts';
import { confirmField, defineOperation, notFound, OpError } from './define.ts';

const sqlite = () => database().sqlite;
const events = z.array(z.enum(Object.keys(noticeEvents) as [string, ...string[]])).nullable();

const webhook = z.object({
	id: z.string(),
	format: z.enum(['generic', 'slack']),
	host: z.string().describe('Only the host is shown; the full address may carry a secret.'),
	events: events.describe('Events sent; null means every event.'),
	enabled: z.boolean(),
	lastStatus: z.number().nullable(),
	lastError: z.string().nullable(),
	lastSentAt: z.number().nullable(),
	createdAt: z.number(),
});

function present(h: WebhookRow): z.input<typeof webhook> {
	return {
		id: h.id,
		format: h.format,
		host: h.host,
		events: h.events ? JSON.parse(h.events) : null,
		enabled: h.disabled_at === null,
		lastStatus: h.last_status,
		lastError: h.last_error,
		lastSentAt: h.last_sent_at,
		createdAt: h.created_at,
	};
}

function load(id: string) {
	const h = sqlite().prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRow | undefined;
	if (!h) throw notFound('Webhook');
	return h;
}

function validUrl(url: string) {
	try {
		return checkUrl(url).toString();
	} catch (e) {
		if (e instanceof OutboundError) throw new OpError(400, 'bad_url', e.message);
		throw e;
	}
}

export const listWebhooks = defineOperation({
	name: 'list_webhooks',
	summary: 'List webhooks with their last delivery result.',
	role: 'owner',
	http: { method: 'GET', path: '/webhooks' },
	input: z.object({}),
	output: z.object({ webhooks: z.array(webhook) }),
	audit: false,
	run: () => ({
		webhooks: (sqlite().prepare('SELECT * FROM webhooks ORDER BY created_at').all() as WebhookRow[]).map(
			present,
		),
	}),
});

export const createWebhook = defineOperation({
	name: 'create_webhook',
	summary:
		'Send notices to an https address: generic JSON signed with HMAC-SHA256 (header X-OpenRoom-Signature: sha256=hex of "timestamp.body", timestamp in X-OpenRoom-Timestamp), or the Slack format for a Slack incoming webhook. The signing secret is shown only in this answer.',
	role: 'owner',
	http: { method: 'POST', path: '/webhooks' },
	input: z.object({
		url: z.string().max(2000),
		format: z.enum(['generic', 'slack']).default('generic'),
		events: events.optional(),
	}),
	output: webhook.extend({ secret: z.string() }),
	audit: { target: (_i, o) => ({ type: 'webhook', id: o.id }), detail: (i) => ({ format: i.format }) },
	run: (input) => {
		const url = validUrl(input.url);
		const secret = randomToken(32);
		const id = newId('whk');
		sqlite()
			.prepare(
				'INSERT INTO webhooks (id, format, host, url_enc, secret_enc, events, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
			)
			.run(
				id,
				input.format,
				new URL(url).host,
				encrypt(url),
				encrypt(secret),
				input.events ? JSON.stringify(input.events) : null,
				Date.now(),
			);
		return { ...present(load(id)), secret };
	},
});

export const updateWebhook = defineOperation({
	name: 'update_webhook',
	summary: 'Turn a webhook on or off, or change its events.',
	role: 'owner',
	http: { method: 'PATCH', path: '/webhooks/{webhookId}' },
	input: z.object({ webhookId: z.string(), enabled: z.boolean().optional(), events: events.optional() }),
	output: webhook,
	audit: { target: (i) => ({ type: 'webhook', id: i.webhookId }), detail: (i) => ({ enabled: i.enabled }) },
	run: (input) => {
		const h = load(input.webhookId);
		const disabled =
			input.enabled === undefined ? h.disabled_at : input.enabled ? null : (h.disabled_at ?? Date.now());
		const ev = input.events === undefined ? h.events : input.events ? JSON.stringify(input.events) : null;
		sqlite().prepare('UPDATE webhooks SET disabled_at = ?, events = ? WHERE id = ?').run(disabled, ev, h.id);
		return present(load(h.id));
	},
});

export const deleteWebhook = defineOperation({
	name: 'delete_webhook',
	summary: 'Delete a webhook.',
	role: 'owner',
	http: { method: 'DELETE', path: '/webhooks/{webhookId}' },
	input: z.object({ webhookId: z.string(), ...confirmField }),
	output: z.object({ ok: z.literal(true) }),
	destructive: (input) => `This deletes the webhook to ${load(input.webhookId).host}.`,
	audit: { target: (i) => ({ type: 'webhook', id: i.webhookId }) },
	run: (input) => {
		sqlite().prepare('DELETE FROM webhooks WHERE id = ?').run(load(input.webhookId).id);
		return { ok: true as const };
	},
});

export const testWebhook = defineOperation({
	name: 'test_webhook',
	summary: 'Send a test event to a webhook now and report what the receiver answered.',
	role: 'owner',
	http: { method: 'POST', path: '/webhooks/{webhookId}/test' },
	input: z.object({ webhookId: z.string() }),
	output: z.object({ sent: z.boolean(), status: z.number(), error: z.string().nullable() }),
	audit: { target: (i) => ({ type: 'webhook', id: i.webhookId }), detail: (_i, o) => ({ sent: o.sent }) },
	run: async (input) => {
		const h = load(input.webhookId);
		const r = await sendWebhook(h, {
			event: 'test',
			text: 'Test from OpenRoom: webhooks work.',
			roomId: null,
			roomName: null,
			investorEmail: null,
			fileId: null,
			noticeId: null,
			at: new Date().toISOString(),
		});
		return { sent: !r.error, status: r.status, error: r.error };
	},
});
