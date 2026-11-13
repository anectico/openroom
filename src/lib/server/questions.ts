import { notify, recordEvent } from './activity.ts';
import { database } from './db/index.ts';
import { EmailError, emailReady, sendEmail } from './email.ts';
import { emailCopy } from './email-copy.ts';
import { newId } from './ids.ts';
import { publicOrigin } from './origin.ts';
import type { ViewerContext } from './viewer/access.ts';

const sqlite = () => database().sqlite;
export const maxBody = 5000;

export type ConversationRow = {
	id: string;
	room_id: string;
	viewer_id: string | null;
	session_id: string | null;
	link_id: string | null;
	file_id: string | null;
	page: number | null;
	last_message_at: number;
	last_author: 'viewer' | 'member';
	created_at: number;
};

export function cleanBody(raw: unknown) {
	const text = String(raw ?? '')
		.replace(/\r\n/g, '\n')
		.trim();
	return text.length ? text.slice(0, maxBody) : null;
}

export function viewerConversations(ctx: ViewerContext) {
	if (!ctx.session.viewer_id) return [];
	const rows = ctx.session.verified
		? sqlite()
				.prepare(
					`SELECT * FROM conversations WHERE room_id = ? AND viewer_id = ?
					AND session_id IN (SELECT id FROM viewer_sessions WHERE viewer_id = ? AND verified = 1) ORDER BY last_message_at DESC`,
				)
				.all(ctx.room.id, ctx.session.viewer_id, ctx.session.viewer_id)
		: sqlite()
				.prepare(
					'SELECT * FROM conversations WHERE room_id = ? AND session_id = ? ORDER BY last_message_at DESC',
				)
				.all(ctx.room.id, ctx.session.id);
	return rows as ConversationRow[];
}

export function viewerConversation(ctx: ViewerContext, id: string) {
	return viewerConversations(ctx).find((c) => c.id === id);
}

export function messagesOf(conversationId: string) {
	return sqlite()
		.prepare(
			`SELECT m.id, m.author, m.body, m.created_at AS createdAt, u.name AS memberName
			FROM messages m LEFT JOIN user u ON u.id = m.author WHERE m.conversation_id = ? ORDER BY m.created_at`,
		)
		.all(conversationId) as {
		id: string;
		author: string;
		body: string;
		createdAt: number;
		memberName: string | null;
	}[];
}

export function askQuestion(
	ctx: ViewerContext,
	input: { fileId: string | null; page: number | null; body: string },
) {
	const now = Date.now();
	const id = newId('conv');
	sqlite()
		.transaction(() => {
			sqlite()
				.prepare(
					`INSERT INTO conversations (id, room_id, viewer_id, session_id, link_id, file_id, page, last_message_at, last_author, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'viewer', ?)`,
				)
				.run(
					id,
					ctx.room.id,
					ctx.session.viewer_id,
					ctx.session.id,
					ctx.link.id,
					input.fileId,
					input.page,
					now,
					now,
				);
			sqlite()
				.prepare(
					'INSERT INTO messages (id, conversation_id, author, session_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
				)
				.run(newId('msg'), id, 'viewer', ctx.session.id, input.body, now);
		})
		.immediate();
	const base = {
		roomId: ctx.room.id,
		linkId: ctx.link.id,
		viewerId: ctx.session.viewer_id,
		fileId: input.fileId,
	};
	recordEvent({ ...base, kind: 'question', sessionId: ctx.session.id, detail: { conversationId: id } });
	notify('question', { ...base, detail: { conversationId: id } });
	return id;
}

export function viewerReply(ctx: ViewerContext, conversation: ConversationRow, body: string) {
	const now = Date.now();
	sqlite()
		.transaction(() => {
			sqlite()
				.prepare(
					'INSERT INTO messages (id, conversation_id, author, session_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
				)
				.run(newId('msg'), conversation.id, 'viewer', ctx.session.id, body, now);
			sqlite()
				.prepare("UPDATE conversations SET last_message_at = ?, last_author = 'viewer' WHERE id = ?")
				.run(now, conversation.id);
		})
		.immediate();
	notify('question', {
		roomId: ctx.room.id,
		linkId: ctx.link.id,
		viewerId: ctx.session.viewer_id,
		fileId: conversation.file_id,
		detail: { conversationId: conversation.id, reply: true },
	});
}

export function memberReply(conversation: ConversationRow, userId: string, body: string) {
	const now = Date.now();
	const id = newId('msg');
	sqlite()
		.transaction(() => {
			sqlite()
				.prepare(
					'INSERT INTO messages (id, conversation_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)',
				)
				.run(id, conversation.id, userId, body, now);
			sqlite()
				.prepare("UPDATE conversations SET last_message_at = ?, last_author = 'member' WHERE id = ?")
				.run(now, conversation.id);
		})
		.immediate();
	return { id, emailed: emailReply(conversation, body) };
}

function emailReply(conversation: ConversationRow, body: string) {
	if (!conversation.viewer_id || !conversation.session_id || !emailReady()) return false;
	const asked = sqlite()
		.prepare('SELECT verified FROM viewer_sessions WHERE id = ?')
		.get(conversation.session_id) as { verified: number } | undefined;
	if (!asked?.verified) return false;
	const viewer = sqlite()
		.prepare(
			`SELECT v.email FROM viewers v WHERE v.id = ? AND v.email IS NOT NULL
			AND EXISTS (SELECT 1 FROM viewer_sessions s JOIN links l ON l.id = s.link_id WHERE s.viewer_id = v.id AND l.room_id = ? AND s.verified = 1)`,
		)
		.get(conversation.viewer_id, conversation.room_id) as { email: string } | undefined;
	if (!viewer) return false;
	const room = sqlite().prepare('SELECT name FROM rooms WHERE id = ?').get(conversation.room_id) as {
		name: string;
	};
	const url = conversation.link_id
		? `${publicOrigin()}/v/${conversation.link_id}/questions/${conversation.id}`
		: null;
	try {
		sendEmail(viewer.email, emailCopy.questionReply({ room: room.name, body, url }));
		return true;
	} catch (e) {
		if (e instanceof EmailError) return false;
		throw e;
	}
}
