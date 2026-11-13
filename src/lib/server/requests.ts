import { fileTypeFromBuffer } from 'file-type';
import { notify, recordEvent } from './activity.ts';
import { database } from './db/index.ts';
import { EmailError, emailReady, sendEmail } from './email.ts';
import { emailCopy } from './email-copy.ts';
import { newId } from './ids.ts';
import { publicOrigin } from './origin.ts';
import { randomToken, sha256 } from './secrets.ts';
import { getSetting } from './settings.ts';
import { diskMarginBytes, freeDiskBytes, newObjectKey, objectBytes, writeLocation } from './storage.ts';
import { defaultMaxUploadBytes, findUpload, uploadTtlMs } from './uploads.ts';
import {
	checkSessionId,
	groupOf,
	linkActive,
	linkById,
	mayEnter,
	type ViewerContext,
} from './viewer/access.ts';

const sqlite = () => database().sqlite;

export type RequestRow = {
	id: string;
	room_id: string;
	target_kind: 'viewer' | 'link' | 'group';
	target_id: string;
	title: string;
	description: string;
	max_size: number;
	due_at: number | null;
	closed_at: number | null;
	created_at: number;
};

export function requestsFor(ctx: ViewerContext, includeClosed = false) {
	if (ctx.preview || !ctx.session.viewer_id) return [];
	const group = groupOf(ctx.link.id);
	return sqlite()
		.prepare(
			`SELECT * FROM file_requests WHERE room_id = ? AND ${includeClosed ? '1 = 1' : 'closed_at IS NULL'} AND (
				(target_kind = 'viewer' AND target_id = ?) OR (target_kind = 'link' AND target_id = ?) OR (target_kind = 'group' AND target_id = ?)
			) ORDER BY created_at DESC`,
		)
		.all(
			ctx.room.id,
			ctx.session.verified ? ctx.session.viewer_id : '',
			ctx.link.id,
			group?.id ?? '',
		) as RequestRow[];
}

export function requestFor(ctx: ViewerContext, id: string, includeClosed = false) {
	return requestsFor(ctx, includeClosed).find((r) => r.id === id);
}

export function uploadsFor(ctx: ViewerContext, requestId: string) {
	return sqlite()
		.prepare(
			`SELECT id, original_name AS name, size, late, uploaded_at AS uploadedAt FROM file_request_uploads
			WHERE request_id = ? AND ${ctx.session.verified ? 'viewer_id = ?' : 'session_id = ?'} ORDER BY uploaded_at DESC`,
		)
		.all(requestId, ctx.session.verified ? ctx.session.viewer_id : ctx.session.id) as {
		id: string;
		name: string;
		size: number;
		late: number;
		uploadedAt: number;
	}[];
}

export class RequestUploadError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export function startRequestUpload(
	ctx: ViewerContext,
	request: RequestRow,
	name: string,
	size: number,
	ip: string | null,
) {
	if (request.closed_at !== null) throw new RequestUploadError(409, 'This request is closed.');
	if (getSetting('storage.move.id'))
		throw new RequestUploadError(409, 'Storage is being moved. Try again when the move finishes.');
	if (!Number.isInteger(size) || size < 1) throw new RequestUploadError(400, 'The file is empty.');
	const maxSize = Math.min(
		request.max_size,
		Number(getSetting('uploads.max_bytes') ?? defaultMaxUploadBytes),
	);
	if (size > maxSize)
		throw new RequestUploadError(
			413,
			`This request accepts files up to ${Math.round(maxSize / 1024 ** 2)} MB.`,
		);
	if (freeDiskBytes() < (writeLocation() === 'disk' ? size : 0) + diskMarginBytes)
		throw new RequestUploadError(507, 'The server is out of space. Try again later.');
	const token = randomToken();
	const id = newId('upl');
	const now = Date.now();
	sqlite()
		.prepare(
			`INSERT INTO uploads (id, token_hash, created_by, client_ip, target, original_name, expected_size, object_key, location, expires_at, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			id,
			sha256(token),
			`session:${ctx.session.id}`,
			ip,
			JSON.stringify({ kind: 'request', requestId: request.id }),
			name.slice(0, 255),
			size,
			newObjectKey(),
			writeLocation(),
			now + uploadTtlMs,
			now,
		);
	return { uploadId: id, url: `${publicOrigin()}/upload/${token}` };
}

export async function finishRequestUpload(ctx: ViewerContext, request: RequestRow, uploadId: string) {
	const u = findUpload(uploadId);
	if (
		!u ||
		u.created_by !== `session:${ctx.session.id}` ||
		u.finished_at !== null ||
		u.expires_at <= Date.now()
	)
		throw new RequestUploadError(404, 'Upload not found.');
	if (u.received_size === null || !u.sha256)
		throw new RequestUploadError(409, 'The file has not arrived yet.');
	const target = JSON.parse(u.target) as { kind: string; requestId: string };
	if (target.kind !== 'request' || target.requestId !== request.id)
		throw new RequestUploadError(404, 'Upload not found.');
	const detected =
		(
			await fileTypeFromBuffer(
				await objectBytes(u.object_key, { start: 0, end: Math.min(u.received_size - 1, 8191) }),
			)
		)?.mime ?? 'application/octet-stream';
	const now = Date.now();
	const id = newId('fru');
	const late = request.due_at !== null && now > request.due_at;
	sqlite()
		.transaction(() => {
			if (getSetting('storage.move.id') || findUpload(u.id)?.location !== u.location)
				throw new RequestUploadError(409, 'Storage is changing. Retry after the move.');
			const fresh = checkSessionId(ctx.session.id);
			if (!fresh.ok || fresh.ctx.needsNda || !requestFor(fresh.ctx, request.id))
				throw new RequestUploadError(404, 'This request is closed or no longer open to you.');
			const claimed = sqlite()
				.prepare(
					'UPDATE uploads SET finished_at = ? WHERE id = ? AND finished_at IS NULL AND expires_at > ? AND in_progress_since IS NULL AND sha256 = ? AND received_size = ?',
				)
				.run(now, u.id, Date.now(), u.sha256, u.received_size);
			if (!claimed.changes) throw new RequestUploadError(409, 'The upload changed. Try again.');
			sqlite()
				.prepare(
					'INSERT INTO objects (key, location, size, sha256, refcount, created_at) VALUES (?, ?, ?, ?, 1, ?)',
				)
				.run(u.object_key, u.location, u.received_size, u.sha256, now);
			sqlite()
				.prepare(
					`INSERT INTO file_request_uploads (id, request_id, viewer_id, session_id, object_key, original_name, detected_type, size, late, uploaded_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					id,
					request.id,
					ctx.session.verified ? ctx.session.viewer_id : null,
					ctx.session.id,
					u.object_key,
					u.original_name,
					detected,
					u.received_size,
					late ? 1 : 0,
					now,
				);
		})
		.immediate();
	const base = { roomId: ctx.room.id, linkId: ctx.link.id, viewerId: ctx.session.viewer_id };
	recordEvent({
		...base,
		kind: 'request_upload',
		sessionId: ctx.session.id,
		detail: { requestId: request.id, uploadId: id },
	});
	notify('request_upload', { ...base, detail: { requestId: request.id, title: request.title, late } });
	return { id, name: u.original_name, size: u.received_size, late, uploadedAt: now };
}

export function emailRequest(request: RequestRow) {
	if (!emailReady()) return 0;
	const rows =
		request.target_kind === 'viewer'
			? sqlite()
					.prepare(
						`SELECT DISTINCT v.email, s.link_id AS linkId FROM viewers v JOIN viewer_sessions s ON s.viewer_id = v.id JOIN links l ON l.id = s.link_id
						WHERE v.id = ? AND l.room_id = ? AND s.verified = 1 AND v.email IS NOT NULL`,
					)
					.all(request.target_id, request.room_id)
			: sqlite()
					.prepare(
						`SELECT DISTINCT v.email, s.link_id AS linkId FROM viewers v JOIN viewer_sessions s ON s.viewer_id = v.id
						WHERE s.verified = 1 AND v.email IS NOT NULL AND s.link_id IN (
							SELECT ? WHERE ? = 'link' UNION SELECT link_id FROM link_groups WHERE group_id = ? AND ? = 'group'
						)`,
					)
					.all(request.target_id, request.target_kind, request.target_id, request.target_kind);
	const room = sqlite().prepare('SELECT name FROM rooms WHERE id = ?').get(request.room_id) as {
		name: string;
	};
	let sent = 0;
	const recipients = new Set<string>();
	for (const r of rows as { email: string; linkId: string }[]) {
		const link = linkById(r.linkId);
		if (!link || !linkActive(link) || !mayEnter(link, r.email) || recipients.has(r.email)) continue;
		recipients.add(r.email);
		try {
			sendEmail(
				r.email,
				emailCopy.fileRequest({
					room: room.name,
					title: request.title,
					url: `${publicOrigin()}/v/${r.linkId}/requests/${request.id}`,
					dueAt: request.due_at,
				}),
			);
			sent++;
		} catch (e) {
			if (!(e instanceof EmailError)) throw e;
			break;
		}
	}
	return sent;
}

export function requestSummaries(ctx: ViewerContext) {
	return requestsFor(ctx, true)
		.map((r) => ({
			id: r.id,
			title: r.title,
			description: r.description,
			dueAt: r.due_at,
			status: r.closed_at
				? ('Closed' as const)
				: uploadsFor(ctx, r.id).length
					? ('Uploaded' as const)
					: ('Action needed' as const),
		}))
		.sort((a, b) => {
			const rank = { 'Action needed': 0, Uploaded: 1, Closed: 2 };
			return (
				rank[a.status] - rank[b.status] ||
				(a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
				a.title.localeCompare(b.title)
			);
		});
}
