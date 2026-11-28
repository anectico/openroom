import { database } from './db/index.ts';

export const unopenedAfterMs = 2 * 86_400_000;

export type AttentionKind = 'question' | 'request_overdue' | 'request_uploads' | 'link_unopened';

export type AttentionItem = {
	kind: AttentionKind;
	id: string;
	roomId: string;
	roomName: string;
	text: string;
	href: string;
	at: number;
};

export type RoomAttention = {
	roomId: string;
	questions: number;
	requests: number;
	unopenedLinks: number;
	total: number;
	lastActivityAt: number | null;
};

const sqlite = () => database().sqlite;
const room = (id: string) => `/admin/rooms/${encodeURIComponent(id)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function waitingQuestions(now: number) {
	return (
		sqlite()
			.prepare(
				`SELECT c.id, c.room_id AS roomId, r.name AS roomName, c.last_message_at AS at, v.email,
					(SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.author = 'viewer'
						AND m.created_at > coalesce((SELECT max(created_at) FROM messages x WHERE x.conversation_id = c.id AND x.author != 'viewer'), 0)) AS waiting
				FROM conversations c JOIN rooms r ON r.id = c.room_id
				LEFT JOIN viewer_sessions s ON s.id = c.session_id LEFT JOIN viewers v ON v.id = coalesce(c.viewer_id, s.viewer_id)
				WHERE c.last_author = 'viewer' AND r.frozen_at IS NULL ORDER BY c.last_message_at`,
			)
			.all() as {
			id: string;
			roomId: string;
			roomName: string;
			at: number;
			email: string | null;
			waiting: number;
		}[]
	).map(
		(q): AttentionItem => ({
			kind: 'question',
			id: q.id,
			roomId: q.roomId,
			roomName: q.roomName,
			at: q.at,
			text: `${q.email ?? 'An investor'} is waiting for an answer${q.waiting > 1 ? ` to ${plural(q.waiting, 'message')}` : ''}${now - q.at >= 86_400_000 ? `, asked ${plural(Math.floor((now - q.at) / 86_400_000), 'day')} ago` : ''}`,
			href: `${room(q.roomId)}/questions/${encodeURIComponent(q.id)}`,
		}),
	);
}

function openRequests(now: number) {
	return (
		sqlite()
			.prepare(
				`SELECT q.id, q.room_id AS roomId, r.name AS roomName, q.title, q.due_at AS dueAt, q.created_at AS createdAt,
					(SELECT count(*) FROM file_request_uploads u WHERE u.request_id = q.id) AS uploads,
					(SELECT max(uploaded_at) FROM file_request_uploads u WHERE u.request_id = q.id) AS lastUpload
				FROM file_requests q JOIN rooms r ON r.id = q.room_id
				WHERE q.closed_at IS NULL AND r.frozen_at IS NULL AND ((q.due_at IS NOT NULL AND q.due_at < ?)
					OR EXISTS (SELECT 1 FROM file_request_uploads u WHERE u.request_id = q.id))
				ORDER BY coalesce(q.due_at, q.created_at)`,
			)
			.all(now) as {
			id: string;
			roomId: string;
			roomName: string;
			title: string;
			dueAt: number | null;
			createdAt: number;
			uploads: number;
			lastUpload: number | null;
		}[]
	).map((q): AttentionItem => {
		const overdue = q.dueAt !== null && q.dueAt < now;
		return {
			kind: overdue ? 'request_overdue' : 'request_uploads',
			id: q.id,
			roomId: q.roomId,
			roomName: q.roomName,
			at: overdue ? (q.dueAt as number) : (q.lastUpload ?? q.createdAt),
			text: overdue
				? `File request “${q.title}” is overdue${q.uploads ? ` with ${plural(q.uploads, 'upload')}` : ' with no uploads'}`
				: `File request “${q.title}” has ${plural(q.uploads, 'upload')} to review; close it when you have what you need`,
			href: `${room(q.roomId)}/requests#request-${encodeURIComponent(q.id)}`,
		};
	});
}

function unopenedLinks(now: number) {
	return (
		sqlite()
			.prepare(
				`SELECT l.id, l.room_id AS roomId, r.name AS roomName, l.label, coalesce(l.invited_at, l.created_at) AS at, l.invited_at AS invitedAt
				FROM links l JOIN rooms r ON r.id = l.room_id
				WHERE l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > ?) AND r.frozen_at IS NULL
					AND coalesce(l.invited_at, l.created_at) < ?
					AND NOT EXISTS (SELECT 1 FROM viewer_sessions s WHERE s.link_id = l.id AND s.preview_by IS NULL)
				ORDER BY at`,
			)
			.all(now, now - unopenedAfterMs) as {
			id: string;
			roomId: string;
			roomName: string;
			label: string;
			at: number;
			invitedAt: number | null;
		}[]
	).map(
		(l): AttentionItem => ({
			kind: 'link_unopened',
			id: l.id,
			roomId: l.roomId,
			roomName: l.roomName,
			at: l.at,
			text: `Link “${l.label}” has not been opened since it was ${l.invitedAt ? 'sent' : 'created'} ${plural(Math.floor((now - l.at) / 86_400_000), 'day')} ago`,
			href: `${room(l.roomId)}/links`,
		}),
	);
}

function lastActivity() {
	return new Map(
		(
			sqlite()
				.prepare(
					`SELECT l.room_id AS roomId, max(s.last_seen_at) AS at FROM viewer_sessions s JOIN links l ON l.id = s.link_id
					WHERE s.preview_by IS NULL GROUP BY l.room_id`,
				)
				.all() as { roomId: string; at: number | null }[]
		).map((r) => [r.roomId, r.at]),
	);
}

export function attention(roomId?: string) {
	const now = Date.now();
	const all = [...waitingQuestions(now), ...openRequests(now), ...unopenedLinks(now)].filter(
		(item) => !roomId || item.roomId === roomId,
	);
	const activity = lastActivity();
	const rooms = (
		sqlite()
			.prepare('SELECT id FROM rooms WHERE ? IS NULL OR id = ? ORDER BY created_at')
			.all(roomId ?? null, roomId ?? null) as { id: string }[]
	).map((r): RoomAttention => {
		const mine = all.filter((item) => item.roomId === r.id);
		const questions = mine.filter((item) => item.kind === 'question').length;
		const requests = mine.filter((item) => item.kind.startsWith('request_')).length;
		const links = mine.filter((item) => item.kind === 'link_unopened').length;
		return {
			roomId: r.id,
			questions,
			requests,
			unopenedLinks: links,
			total: questions + requests + links,
			lastActivityAt: activity.get(r.id) ?? null,
		};
	});
	const order: Record<AttentionKind, number> = {
		question: 0,
		request_overdue: 1,
		request_uploads: 2,
		link_unopened: 3,
	};
	return {
		total: all.length,
		questions: all.filter((item) => item.kind === 'question').length,
		requests: all.filter((item) => item.kind.startsWith('request_')).length,
		unopenedLinks: all.filter((item) => item.kind === 'link_unopened').length,
		rooms,
		items: all.sort((a, b) => order[a.kind] - order[b.kind] || a.at - b.at),
	};
}
