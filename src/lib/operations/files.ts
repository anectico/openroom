import { z } from 'zod';
import { deleteFileActivity } from '../server/activity.ts';
import { database } from '../server/db/index.ts';
import { newId } from '../server/ids.ts';
import {
	descendantFolderIds,
	findFile,
	findFolder,
	kindFor,
	nextPosition,
	place,
	releaseFiles,
} from '../server/rooms.ts';
import { confirmField, defineOperation, notFound, OpError, ok } from './define.ts';

const deleted = ok.extend({ roomId: z.string() });

import { writableRoom } from './rooms.ts';

const folder = z.object({
	id: z.string(),
	roomId: z.string(),
	parentId: z.string().nullable(),
	name: z.string(),
	position: z.number(),
});

const fileVersion = z.object({
	id: z.string(),
	version: z.number(),
	originalName: z.string(),
	contentType: z.string(),
	size: z.number(),
	sha256: z.string(),
	pages: z.number().nullable(),
	createdAt: z.number(),
	current: z.boolean(),
});

export const fileOut = z.object({
	id: z.string(),
	roomId: z.string(),
	folderId: z.string().nullable(),
	title: z.string(),
	kind: z.enum(['pdf', 'image', 'video', 'download']),
	position: z.number(),
	currentVersion: z.number(),
	createdAt: z.number(),
});

const name = z.string().trim().min(1).max(200);
const position = z
	.number()
	.int()
	.min(0)
	.optional()
	.describe('0-based place among its siblings; the end when left out.');

function loadFolder(id: string) {
	const f = findFolder(id);
	if (!f) throw notFound('Folder');
	return f;
}

export function loadFile(id: string) {
	const f = findFile(id);
	if (!f) throw notFound('File');
	return f;
}

function folderIn(roomId: string, folderId: string | null | undefined) {
	if (!folderId) return null;
	const f = loadFolder(folderId);
	if (f.room_id !== roomId) throw new OpError(400, 'wrong_room', 'That folder is in another room.');
	return f.id;
}

function presentFolder(id: string): z.input<typeof folder> {
	const f = loadFolder(id);
	return { id: f.id, roomId: f.room_id, parentId: f.parent_id, name: f.name, position: f.position };
}

export function presentFile(id: string): z.input<typeof fileOut> {
	const f = loadFile(id);
	return {
		id: f.id,
		roomId: f.room_id,
		folderId: f.folder_id,
		title: f.title,
		kind: f.kind,
		position: f.position,
		currentVersion: f.current_version,
		createdAt: f.created_at,
	};
}

export const createFolder = defineOperation({
	name: 'create_folder',
	summary: 'Create a folder in a room, at the top or inside another folder.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms/{roomId}/folders' },
	input: z.object({ roomId: z.string(), parentId: z.string().nullable().optional(), name, position }),
	output: folder,
	audit: { target: (i, o) => ({ type: 'folder', id: o.id, roomId: i.roomId }) },
	run: (input) => {
		const room = writableRoom(input.roomId);
		const parentId = folderIn(room.id, input.parentId);
		const id = newId('fld');
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				sqlite
					.prepare(
						'INSERT INTO folders (id, room_id, parent_id, name, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
					)
					.run(id, room.id, parentId, input.name, nextPosition(room.id, parentId), Date.now());
				if (input.position !== undefined) place(room.id, parentId, { type: 'folder', id }, input.position);
			})
			.immediate();
		return presentFolder(id);
	},
});

export const updateFolder = defineOperation({
	name: 'update_folder',
	summary: 'Rename a folder, move it to another parent (null for the top) or change its place.',
	role: 'admin',
	http: { method: 'PATCH', path: '/folders/{folderId}' },
	input: z.object({
		folderId: z.string(),
		name: name.optional(),
		parentId: z.string().nullable().optional(),
		position,
	}),
	output: folder,
	audit: {
		target: (_i, o) => ({ type: 'folder', id: o.id, roomId: o.roomId }),
		detail: (i) => ({ fields: Object.keys(i).filter((k) => k !== 'folderId') }),
	},
	run: (input) => {
		const f = loadFolder(input.folderId);
		writableRoom(f.room_id);
		const parentId = input.parentId === undefined ? f.parent_id : folderIn(f.room_id, input.parentId);
		if (parentId && descendantFolderIds(f.id).includes(parentId))
			throw new OpError(400, 'cycle', 'A folder cannot move into itself or one of its subfolders.');
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				if (input.name) sqlite.prepare('UPDATE folders SET name = ? WHERE id = ?').run(input.name, f.id);
				if (parentId !== f.parent_id || input.position !== undefined)
					place(f.room_id, parentId, { type: 'folder', id: f.id }, input.position);
			})
			.immediate();
		return presentFolder(f.id);
	},
});

export const deleteFolder = defineOperation({
	name: 'delete_folder',
	summary: 'Delete a folder with everything in it.',
	role: 'admin',
	http: { method: 'DELETE', path: '/folders/{folderId}' },
	input: z.object({ folderId: z.string(), ...confirmField }),
	output: deleted,
	destructive: (input) => {
		const f = loadFolder(input.folderId);
		const ids = descendantFolderIds(f.id);
		const files = (
			database()
				.sqlite.prepare(
					`SELECT count(*) AS n FROM files WHERE folder_id IN (${ids.map(() => '?').join(',')})`,
				)
				.get(...ids) as { n: number }
		).n;
		return `This deletes the folder “${f.name}” with ${ids.length - 1} subfolder(s) and ${files} file(s).`;
	},
	audit: { target: (i, o) => ({ type: 'folder', id: i.folderId, roomId: o.roomId }) },
	run: (input) => {
		const f = loadFolder(input.folderId);
		writableRoom(f.room_id);
		const ids = descendantFolderIds(f.id);
		const marks = ids.map(() => '?').join(',');
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				const files = sqlite.prepare(`SELECT id FROM files WHERE folder_id IN (${marks})`).all(...ids) as {
					id: string;
				}[];
				releaseFiles(files.map((x) => x.id));
				deleteFileActivity(files.map((x) => x.id));
				sqlite.prepare(`DELETE FROM files WHERE folder_id IN (${marks})`).run(...ids);
				sqlite.prepare(`DELETE FROM folders WHERE id IN (${marks})`).run(...ids);
				place(f.room_id, f.parent_id, { type: 'folder', id: '' });
			})
			.immediate();
		return { ok: true as const, roomId: f.room_id };
	},
});

export const updateFile = defineOperation({
	name: 'update_file',
	summary: 'Rename a file, move it to another folder (null for the top) or change its place.',
	role: 'admin',
	http: { method: 'PATCH', path: '/files/{fileId}' },
	input: z.object({
		fileId: z.string(),
		title: name.optional(),
		folderId: z.string().nullable().optional(),
		position,
	}),
	output: fileOut,
	audit: {
		target: (_i, o) => ({ type: 'file', id: o.id, roomId: o.roomId }),
		detail: (i) => ({ fields: Object.keys(i).filter((k) => k !== 'fileId') }),
	},
	run: (input) => {
		const f = loadFile(input.fileId);
		writableRoom(f.room_id);
		const folderId = input.folderId === undefined ? f.folder_id : folderIn(f.room_id, input.folderId);
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				if (input.title) sqlite.prepare('UPDATE files SET title = ? WHERE id = ?').run(input.title, f.id);
				if (folderId !== f.folder_id || input.position !== undefined) {
					place(f.room_id, folderId, { type: 'file', id: f.id }, input.position);
					if (folderId !== f.folder_id) place(f.room_id, f.folder_id, { type: 'file', id: '' });
				}
			})
			.immediate();
		return presentFile(f.id);
	},
});

export const deleteFile = defineOperation({
	name: 'delete_file',
	summary: 'Delete a file and all its versions.',
	role: 'admin',
	http: { method: 'DELETE', path: '/files/{fileId}' },
	input: z.object({ fileId: z.string(), ...confirmField }),
	output: deleted,
	destructive: (input) => {
		const f = loadFile(input.fileId);
		const versions = (
			database().sqlite.prepare('SELECT count(*) AS n FROM file_versions WHERE file_id = ?').get(f.id) as {
				n: number;
			}
		).n;
		return `This deletes the file “${f.title}” and its ${versions} version(s); investors stop seeing it at once.`;
	},
	audit: { target: (i, o) => ({ type: 'file', id: i.fileId, roomId: o.roomId }) },
	run: (input) => {
		const f = loadFile(input.fileId);
		writableRoom(f.room_id);
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				releaseFiles([f.id]);
				deleteFileActivity([f.id]);
				sqlite.prepare('DELETE FROM files WHERE id = ?').run(f.id);
				place(f.room_id, f.folder_id, { type: 'file', id: '' });
			})
			.immediate();
		return { ok: true as const, roomId: f.room_id };
	},
});

export const listFileVersions = defineOperation({
	name: 'list_file_versions',
	summary: 'List a file’s versions, newest first, and which one investors see.',
	role: 'observer',
	http: { method: 'GET', path: '/files/{fileId}/versions' },
	input: z.object({ fileId: z.string() }),
	output: z.object({ file: fileOut, versions: z.array(fileVersion) }),
	audit: false,
	run: (input) => {
		const f = loadFile(input.fileId);
		const rows = database()
			.sqlite.prepare(
				`SELECT v.id, v.version, v.original_name AS originalName, v.content_type AS contentType, v.size, o.sha256,
					v.pages, v.created_at AS createdAt
				FROM file_versions v JOIN objects o ON o.key = v.object_key WHERE v.file_id = ? ORDER BY v.version DESC`,
			)
			.all(f.id) as Omit<z.input<typeof fileVersion>, 'current'>[];
		return {
			file: presentFile(f.id),
			versions: rows.map((v) => ({ ...v, current: v.version === f.current_version })),
		};
	},
});

export const setCurrentVersion = defineOperation({
	name: 'set_current_version',
	summary: 'Make an earlier version the one investors see, for example to undo a wrong upload.',
	role: 'admin',
	http: { method: 'POST', path: '/files/{fileId}/current-version' },
	input: z.object({ fileId: z.string(), version: z.number().int().min(1) }),
	output: fileOut,
	audit: {
		target: (_i, o) => ({ type: 'file', id: o.id, roomId: o.roomId }),
		detail: (i) => ({ version: i.version }),
	},
	run: (input) => {
		const f = loadFile(input.fileId);
		writableRoom(f.room_id);
		const v = database()
			.sqlite.prepare('SELECT content_type FROM file_versions WHERE file_id = ? AND version = ?')
			.get(f.id, input.version) as { content_type: string } | undefined;
		if (!v) throw notFound(`Version ${input.version}`);
		database()
			.sqlite.prepare('UPDATE files SET current_version = ?, kind = ? WHERE id = ?')
			.run(input.version, kindFor(v.content_type), f.id);
		return presentFile(f.id);
	},
});
