import { database } from './db/index.ts';
import { deliver, EmailError, emailConfig, emailReady, sendEmail } from './email.ts';
import { emailCopy } from './email-copy.ts';
import { enqueue } from './jobs.ts';
import { publicOrigin } from './origin.ts';
import { queueWebhooks } from './webhooks.ts';

export const noticeEvents = {
	first_open: 'Link opened for the first time',
	visit: 'Every visit on links with "notify me on every view"',
	nda_accepted: 'NDA accepted',
	read_past: 'File mostly read',
	download: 'File or zip downloaded',
	question: 'Question asked or answered by an investor',
	request_upload: 'File uploaded for a request',
	room_frozen: 'Room frozen',
	archive_ready: 'Freeze archive ready',
	email_cap: 'Email sending stopped by the daily cap',
	replication_stopped: 'Database replication stopped',
	disk_low: 'Server disk space is low',
} as const;

export type NoticeEvent = keyof typeof noticeEvents;

const sqlite = () => database().sqlite;

type EventInput = {
	kind: string;
	roomId: string;
	linkId?: string | null;
	viewerId?: string | null;
	sessionId?: string | null;
	fileId?: string | null;
	fileVersionId?: string | null;
	detail?: Record<string, unknown> | null;
};

export function recordEvent(e: EventInput) {
	sqlite()
		.prepare(
			`INSERT INTO events (kind, room_id, link_id, viewer_id, session_id, file_id, file_version_id, detail_json, at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			e.kind,
			e.roomId,
			e.linkId ?? null,
			e.viewerId ?? null,
			e.sessionId ?? null,
			e.fileId ?? null,
			e.fileVersionId ?? null,
			e.detail ? JSON.stringify(e.detail) : null,
			Date.now(),
		);
}

export function notify(
	event: NoticeEvent,
	e: Omit<EventInput, 'kind' | 'sessionId' | 'fileVersionId' | 'roomId'> & { roomId?: string | null },
) {
	const result = sqlite()
		.prepare(
			'INSERT INTO notices (event, room_id, link_id, viewer_id, file_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		)
		.run(
			event,
			e.roomId ?? null,
			e.linkId ?? null,
			e.viewerId ?? null,
			e.fileId ?? null,
			e.detail ? JSON.stringify(e.detail) : null,
			Date.now(),
		);
	enqueue('notices.email', { noticeId: Number(result.lastInsertRowid) });
	queueWebhooks(Number(result.lastInsertRowid), event);
}

export function emailWanted(userId: string, role: string, event: string) {
	const pref = sqlite()
		.prepare('SELECT email FROM notification_prefs WHERE user_id = ? AND event = ?')
		.get(userId, event) as { email: number } | undefined;
	return pref ? !!pref.email : role !== 'observer';
}

type NoticeRow = {
	id: number;
	event: NoticeEvent;
	room_id: string | null;
	viewer_id: string | null;
	file_id: string | null;
	detail_json: string | null;
};

export function describeNotice(n: NoticeRow) {
	const viewer = n.viewer_id
		? ((
				sqlite().prepare('SELECT email FROM viewers WHERE id = ?').get(n.viewer_id) as
					| { email: string | null }
					| undefined
			)?.email ?? 'An erased investor')
		: null;
	const room = n.room_id
		? (sqlite().prepare('SELECT name FROM rooms WHERE id = ?').get(n.room_id) as { name: string } | undefined)
				?.name
		: undefined;
	const file = n.file_id
		? (
				sqlite().prepare('SELECT title FROM files WHERE id = ?').get(n.file_id) as
					| { title: string }
					| undefined
			)?.title
		: undefined;
	const detail = n.detail_json ? (JSON.parse(n.detail_json) as Record<string, unknown>) : {};
	const inRoom = room ? ` ${room}` : ' a room';
	switch (n.event) {
		case 'first_open':
			return `${viewer} opened${inRoom} for the first time`;
		case 'visit':
			return `${viewer} opened${inRoom}`;
		case 'nda_accepted':
			return `${viewer} accepted the NDA of${inRoom}`;
		case 'read_past':
			return `${viewer} read most of ${file ?? 'a file'} in${inRoom}`;
		case 'download':
			return detail.zip
				? `${viewer} downloaded${inRoom} as a zip`
				: `${viewer} downloaded ${file ?? 'a file'} from${inRoom}`;
		case 'question':
			return detail.reply
				? `${viewer} replied to a question in${inRoom}`
				: `${viewer} asked a question${file ? ` about ${file}` : ''} in${inRoom}`;
		case 'request_upload':
			return `${viewer} uploaded a file for “${detail.title ?? 'a request'}” in${inRoom}${detail.late ? ' (late)' : ''}`;
		case 'room_frozen':
			return `${room ?? 'A room'} was frozen`;
		case 'archive_ready':
			return `The archive of ${room ?? 'a frozen room'} is ready`;
		case 'replication_stopped':
			return 'The database backup has not been confirmed recently. Check storage and replication in Settings.';
		case 'disk_low':
			return 'The server is running low on disk space. Free space or move files to S3.';
		case 'email_cap':
			return `Email sending stopped: the daily cap of ${detail.cap ?? ''} emails was reached`;
		default:
			return String(n.event);
	}
}

export function noticeHref(n: NoticeRow) {
	const room = n.room_id ? `/admin/rooms/${encodeURIComponent(n.room_id)}` : null;
	const detail = n.detail_json ? (JSON.parse(n.detail_json) as Record<string, unknown>) : {};
	if (room && n.event === 'question') {
		const id = detail.conversationId;
		const exists =
			typeof id === 'string' &&
			sqlite().prepare('SELECT 1 FROM conversations WHERE id = ? AND room_id = ?').get(id, n.room_id);
		return exists ? `${room}/questions/${encodeURIComponent(id as string)}` : `${room}/questions`;
	}
	if (room && n.event === 'request_upload') {
		const id = detail.requestId;
		const exists =
			typeof id === 'string' &&
			sqlite().prepare('SELECT 1 FROM file_requests WHERE id = ? AND room_id = ?').get(id, n.room_id);
		return exists ? `${room}/requests#request-${encodeURIComponent(id as string)}` : `${room}/requests`;
	}
	if (n.event === 'replication_stopped' || n.event === 'disk_low') return '/admin/settings/storage';
	if (n.event === 'email_cap') return '/admin/settings#email';
	if (room && (n.event === 'room_frozen' || n.event === 'archive_ready')) return room;
	if (n.viewer_id) return `/admin/investors/${encodeURIComponent(n.viewer_id)}`;
	return room ? `${room}/activity` : '/admin/notifications';
}

export async function runNoticeEmail(payload: unknown) {
	const { noticeId } = payload as { noticeId: number };
	if (!emailReady()) return;
	const n = sqlite().prepare('SELECT * FROM notices WHERE id = ?').get(noticeId) as NoticeRow | undefined;
	if (!n) return;
	const text = describeNotice(n);
	const url = `${publicOrigin()}${noticeHref(n)}`;
	const members = sqlite()
		.prepare(
			`SELECT u.id, u.email, u.role FROM user u WHERE u.removed_at IS NULL
			AND EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential')`,
		)
		.all() as { id: string; email: string; role: string }[];
	for (const m of members) {
		if (!emailWanted(m.id, m.role, n.event)) continue;
		try {
			sendEmail(m.email, emailCopy.notice({ text, url }), 'email.notice');
		} catch (e) {
			if (!(e instanceof EmailError)) throw e;
			return;
		}
	}
}

export function fileVersionPages(fileVersionId: string) {
	return (
		sqlite().prepare('SELECT pages FROM file_versions WHERE id = ?').get(fileVersionId) as
			| { pages: number | null }
			| undefined
	)?.pages;
}

export async function runCapEmail() {
	const config = emailConfig();
	if (!config) return;
	const owners = sqlite()
		.prepare(
			`SELECT u.email FROM user u WHERE u.role = 'owner' AND u.removed_at IS NULL
			AND EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential')`,
		)
		.all() as { email: string }[];
	for (const o of owners)
		await deliver(
			config,
			o.email,
			emailCopy.notice({
				text: 'OpenRoom stopped sending email for today: the daily cap was reached. Raise it in Settings if you expect more.',
				url: `${publicOrigin()}/admin/settings`,
			}),
		);
}

export function applyRetention() {
	const now = Date.now();
	const expired = sqlite()
		.prepare(
			'SELECT id FROM rooms WHERE frozen_at IS NOT NULL AND frozen_at + frozen_retention_days * 86400000 < ?',
		)
		.all(now) as { id: string }[];
	for (const r of expired) {
		for (const table of ['page_reads', 'video_reads', 'events'])
			sqlite().prepare(`DELETE FROM ${table} WHERE room_id = ?`).run(r.id);
		sqlite()
			.prepare("UPDATE exports SET expires_at = ? WHERE room_id = ? AND kind = 'archive'")
			.run(now - 1, r.id);
	}
	const cutoff = now - 365 * 86_400_000;
	sqlite()
		.prepare(
			'UPDATE viewer_sessions SET ip = NULL, user_agent = NULL WHERE created_at < ? AND (ip IS NOT NULL OR user_agent IS NOT NULL)',
		)
		.run(cutoff);
	sqlite()
		.prepare('UPDATE uploads SET client_ip = NULL WHERE created_at < ? AND client_ip IS NOT NULL')
		.run(cutoff);
}

export function deleteRoomActivity(roomId: string) {
	for (const table of ['page_reads', 'video_reads', 'events', 'notices'])
		sqlite().prepare(`DELETE FROM ${table} WHERE room_id = ?`).run(roomId);
	sqlite().prepare('DELETE FROM notice_reads WHERE notice_id NOT IN (SELECT id FROM notices)').run();
}

export function deleteFileActivity(fileIds: string[]) {
	for (const id of fileIds) {
		for (const table of ['page_reads', 'video_reads', 'events'])
			sqlite().prepare(`DELETE FROM ${table} WHERE file_id = ?`).run(id);
		sqlite().prepare('UPDATE notices SET file_id = NULL WHERE file_id = ?').run(id);
	}
}
