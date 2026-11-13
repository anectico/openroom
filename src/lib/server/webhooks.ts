import { database } from './db/index.ts';
import { enqueue } from './jobs.ts';
import { postJson } from './outbound.ts';
import { decrypt, hmacWith } from './secrets.ts';

const sqlite = () => database().sqlite;

export type WebhookRow = {
	id: string;
	format: 'generic' | 'slack';
	host: string;
	url_enc: string;
	secret_enc: string;
	events: string | null;
	last_status: number | null;
	last_error: string | null;
	last_sent_at: number | null;
	disabled_at: number | null;
	created_at: number;
};

export function queueWebhooks(noticeId: number, event: string) {
	const hooks = sqlite().prepare('SELECT id, events FROM webhooks WHERE disabled_at IS NULL').all() as {
		id: string;
		events: string | null;
	}[];
	for (const h of hooks) {
		const events = h.events ? (JSON.parse(h.events) as string[]) : null;
		if (events && !events.includes(event)) continue;
		enqueue('webhook.deliver', { webhookId: h.id, noticeId }, { maxAttempts: 6 });
	}
}

type Payload = {
	event: string;
	text: string;
	roomId: string | null;
	roomName: string | null;
	investorEmail: string | null;
	fileId: string | null;
	noticeId: number | null;
	at: string;
};

export async function sendWebhook(hook: WebhookRow, payload: Payload) {
	const body = JSON.stringify(hook.format === 'slack' ? { text: payload.text } : payload);
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature = hmacWith(Buffer.from(decrypt(hook.secret_enc)), `${timestamp}.${body}`);
	let status = 0;
	let error: string | null = null;
	try {
		const r = await postJson(decrypt(hook.url_enc), body, {
			'user-agent': 'OpenRoom-Webhook',
			'x-openroom-event': payload.event,
			'x-openroom-timestamp': timestamp,
			'x-openroom-signature': `sha256=${signature}`,
		});
		status = r.status;
		if (status < 200 || status >= 300) error = `The receiver answered ${status}.`;
	} catch (e) {
		error = e instanceof Error ? e.message : 'The request failed.';
	}
	sqlite()
		.prepare('UPDATE webhooks SET last_status = ?, last_error = ?, last_sent_at = ? WHERE id = ?')
		.run(status || null, error, Date.now(), hook.id);
	return { status, error };
}

export async function runWebhookJob(payload: unknown) {
	const { webhookId, noticeId } = payload as { webhookId: string; noticeId: number };
	const hook = sqlite()
		.prepare('SELECT * FROM webhooks WHERE id = ? AND disabled_at IS NULL')
		.get(webhookId) as WebhookRow | undefined;
	if (!hook) return;
	const { describeNotice } = await import('./activity.ts');
	const n = sqlite().prepare('SELECT * FROM notices WHERE id = ?').get(noticeId) as Parameters<
		typeof describeNotice
	>[0] & {
		created_at: number;
	};
	if (!n) return;
	const room = n.room_id
		? (sqlite().prepare('SELECT name FROM rooms WHERE id = ?').get(n.room_id) as { name: string } | undefined)
		: undefined;
	const viewer = n.viewer_id
		? (sqlite().prepare('SELECT email FROM viewers WHERE id = ?').get(n.viewer_id) as
				| { email: string | null }
				| undefined)
		: undefined;
	const r = await sendWebhook(hook, {
		event: n.event,
		text: describeNotice(n),
		roomId: n.room_id,
		roomName: room?.name ?? null,
		investorEmail: viewer?.email ?? null,
		fileId: n.file_id,
		noticeId: n.id,
		at: new Date(n.created_at).toISOString(),
	});
	if (r.error) throw new Error(r.error);
}
