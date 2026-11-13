import { z } from 'zod';
import { defaultLinkSettings, linkSettings } from '../schemas/link-settings.ts';
import { deleteRoomActivity, notify } from '../server/activity.ts';
import { latestArchive, startArchive } from '../server/archive.ts';
import { database } from '../server/db/index.ts';
import { duplicateRoom } from '../server/duplicate.ts';
import { emailReady } from '../server/email.ts';
import { newId } from '../server/ids.ts';
import { publicOrigin } from '../server/origin.ts';
import { pinnedFileIds } from '../server/pins.ts';
import { createIndexExport } from '../server/room-index.ts';
import {
	assertWritable,
	findRoom,
	type RoomRow,
	releaseFiles,
	releaseObject,
	roomTree,
	slugFor,
} from '../server/rooms.ts';
import { confirmField, defineOperation, notFound, OpError, ok } from './define.ts';

const room = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	welcomeMarkdown: z.string(),
	pinnedFileIds: z.array(z.string()).describe('Ordered Start here documents. Pinning never changes access.'),
	linkDefaults: linkSettings,
	hasNda: z.boolean().describe('Whether the room has NDA text, needed before requiring an NDA.'),
	frozenAt: z.number().nullable(),
	frozenRetentionDays: z.number(),
	createdAt: z.number(),
	fileCount: z.number(),
	activeLinkCount: z.number(),
	viewersLast7Days: z.number(),
});

const treeNode = z.object({
	type: z.enum(['folder', 'file']),
	id: z.string(),
	parentId: z.string().nullable(),
	number: z.string().describe('The index number, such as 1.2.'),
	depth: z.number(),
	name: z.string(),
	kind: z.enum(['pdf', 'image', 'video', 'download']).nullable(),
	version: z.number().nullable(),
	size: z.number().nullable(),
	contentType: z.string().nullable(),
});

const roomId = z.object({ roomId: z.string() });
const name = z.string().trim().min(1).max(120);

export function loadRoom(id: string) {
	const r = findRoom(id);
	if (!r) throw notFound('Room');
	return r;
}

export function writableRoom(id: string) {
	const r = loadRoom(id);
	assertWritable(r);
	return r;
}

function count(sql: string, id: string) {
	return (database().sqlite.prepare(sql).get(id) as { n: number }).n;
}

function present(r: RoomRow): z.input<typeof room> {
	return {
		id: r.id,
		name: r.name,
		slug: r.slug,
		welcomeMarkdown: r.welcome_markdown,
		pinnedFileIds: pinnedFileIds(r.id),
		linkDefaults: { ...defaultLinkSettings, ...JSON.parse(r.defaults_json) },
		hasNda: r.current_nda_version_id !== null,
		frozenAt: r.frozen_at,
		frozenRetentionDays: r.frozen_retention_days,
		createdAt: r.created_at,
		fileCount: count('SELECT count(*) AS n FROM files WHERE room_id = ?', r.id),
		activeLinkCount: count(
			'SELECT count(*) AS n FROM links WHERE room_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > unixepoch() * 1000)',
			r.id,
		),
		viewersLast7Days: (
			database()
				.sqlite.prepare(
					'SELECT count(DISTINCT s.viewer_id) AS n FROM viewer_sessions s JOIN links l ON l.id = s.link_id WHERE l.room_id = ? AND s.preview_by IS NULL AND s.last_seen_at > ?',
				)
				.get(r.id, Date.now() - 7 * 86_400_000) as { n: number }
		).n,
	};
}

export const listRooms = defineOperation({
	name: 'list_rooms',
	summary: 'List every room with its file and active link counts.',
	role: 'observer',
	http: { method: 'GET', path: '/rooms' },
	input: z.object({}),
	output: z.object({ rooms: z.array(room) }),
	audit: false,
	run: () => {
		const rows = database().sqlite.prepare('SELECT * FROM rooms ORDER BY created_at').all() as RoomRow[];
		return { rooms: rows.map(present) };
	},
});

export const getRoom = defineOperation({
	name: 'get_room',
	summary: 'Show one room: its settings, link defaults and the numbered folder and file tree.',
	role: 'observer',
	http: { method: 'GET', path: '/rooms/{roomId}' },
	input: roomId,
	output: room.extend({ tree: z.array(treeNode) }),
	audit: false,
	run: (input) => {
		const r = loadRoom(input.roomId);
		return { ...present(r), tree: roomTree(r.id) };
	},
});

export const createRoom = defineOperation({
	name: 'create_room',
	summary: 'Create an empty room. Links made in it start from its link defaults.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms' },
	input: z.object({ name }),
	output: room,
	audit: { target: (_i, o) => ({ type: 'room', id: o.id, roomId: o.id }) },
	run: (input) => {
		const id = newId('room');
		database()
			.sqlite.prepare('INSERT INTO rooms (id, name, slug, defaults_json, created_at) VALUES (?, ?, ?, ?, ?)')
			.run(
				id,
				input.name,
				slugFor(input.name),
				JSON.stringify({ ...defaultLinkSettings, verifyEmail: emailReady() }),
				Date.now(),
			);
		return present(loadRoom(id));
	},
});

export const updateRoom = defineOperation({
	name: 'update_room',
	summary: 'Rename a room or change its welcome text (Markdown).',
	role: 'admin',
	http: { method: 'PATCH', path: '/rooms/{roomId}' },
	input: roomId.extend({ name: name.optional(), welcomeMarkdown: z.string().max(20_000).optional() }),
	output: room,
	audit: {
		target: (i) => ({ type: 'room', id: i.roomId, roomId: i.roomId }),
		detail: (i) => ({ fields: Object.keys(i).filter((k) => k !== 'roomId') }),
	},
	run: (input) => {
		const r = writableRoom(input.roomId);
		database()
			.sqlite.prepare('UPDATE rooms SET name = ?, welcome_markdown = ? WHERE id = ?')
			.run(input.name ?? r.name, input.welcomeMarkdown ?? r.welcome_markdown, r.id);
		return present(loadRoom(r.id));
	},
});

export const deleteRoom = defineOperation({
	name: 'delete_room',
	summary:
		'Delete a room with its folders, files, links, groups and activity. NDA texts and acceptances are kept as evidence; stored files are kept for the retention window.',
	role: 'owner',
	http: { method: 'DELETE', path: '/rooms/{roomId}' },
	input: roomId.extend(confirmField),
	output: ok,
	destructive: (input) => {
		const r = present(loadRoom(input.roomId));
		return `This deletes the room “${r.name}” with ${r.fileCount} file(s) and ends ${r.activeLinkCount} active link(s); investors lose access at once.`;
	},
	audit: { target: (i) => ({ type: 'room', id: i.roomId, roomId: i.roomId }) },
	run: (input) => {
		const r = loadRoom(input.roomId);
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				const fileIds = (
					sqlite.prepare('SELECT id FROM files WHERE room_id = ?').all(r.id) as { id: string }[]
				).map((f) => f.id);
				releaseFiles(fileIds);
				if (r.logo_object_key) releaseObject(r.logo_object_key);
				sqlite.prepare('DELETE FROM files WHERE room_id = ?').run(r.id);
				sqlite.prepare('DELETE FROM folders WHERE room_id = ?').run(r.id);
				for (const u of sqlite
					.prepare(
						'SELECT u.object_key FROM file_request_uploads u JOIN file_requests q ON q.id = u.request_id WHERE q.room_id = ?',
					)
					.all(r.id) as { object_key: string }[])
					releaseObject(u.object_key);
				deleteRoomActivity(r.id);
				sqlite.prepare('UPDATE exports SET expires_at = 0 WHERE room_id = ?').run(r.id);
				sqlite.prepare('DELETE FROM rooms WHERE id = ?').run(r.id);
			})
			.immediate();
		return { ok: true as const };
	},
});

export const duplicateRoomOp = defineOperation({
	name: 'duplicate_room',
	summary:
		'Copy a room: folders, files (sharing the stored data, nothing is copied), groups and their permissions, link defaults, the current NDA and branding. Never its links, investors, activity, questions or requests.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms/{roomId}/duplicate' },
	input: roomId.extend({ name }),
	output: room,
	audit: {
		target: (_i, o) => ({ type: 'room', id: o.id, roomId: o.id }),
		detail: (i) => ({ sourceRoomId: i.roomId }),
	},
	run: (input) => present(loadRoom(duplicateRoom(loadRoom(input.roomId).id, input.name))),
});

export const exportRoomIndex = defineOperation({
	name: 'export_room_index',
	summary:
		'Make the room’s numbered index of folders and files as CSV or PDF. Answers with a download address valid 24 hours.',
	role: 'observer',
	http: { method: 'POST', path: '/rooms/{roomId}/index' },
	input: roomId.extend({ format: z.enum(['csv', 'pdf']).default('pdf') }),
	output: z.object({ exportId: z.string(), downloadUrl: z.string() }),
	audit: {
		target: (i, o) => ({ type: 'export', id: o.exportId, roomId: i.roomId }),
		detail: (i) => ({ format: i.format }),
	},
	run: async (input, ctx) => {
		const r = loadRoom(input.roomId);
		const id = await createIndexExport(r.id, r.name, input.format, ctx.actor.userId);
		const path =
			ctx.actor.surface === 'admin' ? `/admin/exports/${id}?download=1` : `/api/v1/exports/${id}/download`;
		return { exportId: id, downloadUrl: `${publicOrigin()}${path}` };
	},
});

const archiveOut = z.object({
	status: z.enum(['none', 'pending', 'running', 'ready', 'failed']),
	progress: z.number(),
	size: z.number().nullable(),
	downloadUrl: z.string().nullable(),
	keptUntil: z.number().nullable(),
});

function archiveStatus(roomId: string, surface: string): z.input<typeof archiveOut> {
	const a = latestArchive(roomId);
	if (!a) return { status: 'none', progress: 0, size: null, downloadUrl: null, keptUntil: null };
	const path =
		surface === 'admin' ? `/admin/rooms/${roomId}/archive` : `/api/v1/rooms/${roomId}/archive/download`;
	return {
		status: a.status as z.input<typeof archiveOut>['status'],
		progress: a.progress,
		size: a.size,
		downloadUrl: a.status === 'ready' ? `${publicOrigin()}${path}` : null,
		keptUntil: a.expires_at,
	};
}

export const freezeRoom = defineOperation({
	name: 'freeze_room',
	summary:
		'Freeze a room at the end of a deal, for good: every link is revoked, open file requests close, the room becomes read only (except its retention and deletion), and an archive is built with all files, the index, the audit log, the questions, the activity and a SHA-256 manifest.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms/{roomId}/freeze' },
	input: roomId.extend(confirmField),
	output: room.extend({ archive: archiveOut }),
	destructive: (input) => {
		const r = present(loadRoom(input.roomId));
		return `This freezes “${r.name}” for good: its ${r.activeLinkCount} active link(s) are revoked, investors lose access at once, and nothing in it can change again. An archive is made.`;
	},
	audit: { target: (i) => ({ type: 'room', id: i.roomId, roomId: i.roomId }) },
	run: (input, ctx) => {
		const r = writableRoom(input.roomId);
		const now = Date.now();
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				sqlite
					.prepare('UPDATE links SET revoked_at = ? WHERE room_id = ? AND revoked_at IS NULL')
					.run(now, r.id);
				sqlite
					.prepare('UPDATE file_requests SET closed_at = ? WHERE room_id = ? AND closed_at IS NULL')
					.run(now, r.id);
				sqlite.prepare('UPDATE rooms SET frozen_at = ? WHERE id = ?').run(now, r.id);
				startArchive(r.id, ctx.actor.userId);
			})
			.immediate();
		notify('room_frozen', { roomId: r.id });
		return { ...present(loadRoom(r.id)), archive: archiveStatus(r.id, ctx.actor.surface) };
	},
});

export const setRoomRetention = defineOperation({
	name: 'set_room_retention',
	summary:
		'Choose how long a frozen room keeps its activity and archive (in days, 2 years by default). NDA acceptances are always kept.',
	role: 'admin',
	http: { method: 'PUT', path: '/rooms/{roomId}/retention' },
	input: roomId.extend({ days: z.number().int().min(30).max(3650) }),
	output: z.object({ roomId: z.string(), days: z.number() }),
	audit: {
		target: (i) => ({ type: 'room', id: i.roomId, roomId: i.roomId }),
		detail: (i) => ({ days: i.days }),
	},
	run: (input) => {
		const r = loadRoom(input.roomId);
		const sqlite = database().sqlite;
		sqlite.prepare('UPDATE rooms SET frozen_retention_days = ? WHERE id = ?').run(input.days, r.id);
		if (r.frozen_at)
			sqlite
				.prepare("UPDATE exports SET expires_at = ? WHERE room_id = ? AND kind = 'archive'")
				.run(r.frozen_at + input.days * 86_400_000, r.id);
		return { roomId: r.id, days: input.days };
	},
});

export const retryRoomArchive = defineOperation({
	name: 'retry_room_archive',
	summary:
		'Build the freeze archive of a frozen room again when it failed (for example, the disk was full) or is missing.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms/{roomId}/archive/retry' },
	input: roomId,
	output: archiveOut,
	audit: { target: (i) => ({ type: 'room', id: i.roomId, roomId: i.roomId }) },
	run: (input, ctx) => {
		const r = loadRoom(input.roomId);
		if (!r.frozen_at) throw new OpError(400, 'not_frozen', 'Only a frozen room has an archive.');
		const a = latestArchive(r.id);
		if (a && a.status !== 'failed')
			throw new OpError(409, 'archive_exists', 'The archive is ready or still being built.');
		startArchive(r.id, ctx.actor.userId);
		return archiveStatus(r.id, ctx.actor.surface);
	},
});

export const getRoomArchive = defineOperation({
	name: 'get_room_archive',
	summary:
		'Show the freeze archive of a room: whether it is ready, its size, how long it is kept and its download address.',
	role: 'observer',
	http: { method: 'GET', path: '/rooms/{roomId}/archive' },
	input: roomId,
	output: archiveOut,
	audit: false,
	run: (input, ctx) => archiveStatus(loadRoom(input.roomId).id, ctx.actor.surface),
});
