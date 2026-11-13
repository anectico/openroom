import { z } from 'zod';
import { database } from '../server/db/index.ts';
import { newId } from '../server/ids.ts';
import { findFile, findFolder } from '../server/rooms.ts';
import { accessMap } from '../server/viewer/access.ts';
import { confirmField, defineOperation, notFound, OpError, ok } from './define.ts';
import { loadRoom, writableRoom } from './rooms.ts';

const access = z.enum(['view', 'none']);

const group = z.object({
	id: z.string(),
	roomId: z.string(),
	name: z.string(),
	defaultAccess: access.describe(
		'Access to top-level items without their own choice, including ones added later.',
	),
	linkCount: z.number(),
});

type GroupRow = { id: string; room_id: string; name: string; default_access: 'view' | 'none' };

const sqlite = () => database().sqlite;

function loadGroup(id: string) {
	const g = sqlite().prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined;
	if (!g) throw notFound('Group');
	return g;
}

function present(g: GroupRow): z.input<typeof group> {
	const n = (
		sqlite()
			.prepare(
				'SELECT count(*) AS n FROM link_groups lg JOIN links l ON l.id = lg.link_id WHERE lg.group_id = ? AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > ?)',
			)
			.get(g.id, Date.now()) as { n: number }
	).n;
	return { id: g.id, roomId: g.room_id, name: g.name, defaultAccess: g.default_access, linkCount: n };
}

export const listGroups = defineOperation({
	name: 'list_groups',
	summary:
		'List a room’s viewer groups. A link in a group sees only what the group allows; a link without one sees the whole room.',
	role: 'observer',
	http: { method: 'GET', path: '/rooms/{roomId}/groups' },
	input: z.object({ roomId: z.string() }),
	output: z.object({ groups: z.array(group) }),
	audit: false,
	run: (input) => {
		loadRoom(input.roomId);
		const rows = sqlite()
			.prepare('SELECT * FROM groups WHERE room_id = ? ORDER BY name')
			.all(input.roomId) as GroupRow[];
		return { groups: rows.map(present) };
	},
});

export const getGroup = defineOperation({
	name: 'get_group',
	summary:
		'Show a group with the room tree and, for each folder and file, whether the group sees it and whether that is inherited.',
	role: 'observer',
	http: { method: 'GET', path: '/groups/{groupId}' },
	input: z.object({ groupId: z.string() }),
	output: group.extend({
		tree: z.array(
			z.object({
				type: z.enum(['folder', 'file']),
				id: z.string(),
				parentId: z.string().nullable(),
				number: z.string(),
				depth: z.number(),
				name: z.string(),
				access,
				inherited: z.boolean(),
			}),
		),
	}),
	audit: false,
	run: (input) => {
		const g = loadGroup(input.groupId);
		const { tree, result } = accessMap(g.room_id, { id: g.id, default_access: g.default_access });
		return {
			...present(g),
			tree: tree.map((n) => ({
				type: n.type,
				id: n.id,
				parentId: n.parentId,
				number: n.number,
				depth: n.depth,
				name: n.name,
				access: result.get(n.id)?.access ?? 'none',
				inherited: result.get(n.id)?.inherited ?? true,
			})),
		};
	},
});

export const createGroup = defineOperation({
	name: 'create_group',
	summary: 'Create a viewer group in a room, such as one fund’s partners.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms/{roomId}/groups' },
	input: z.object({
		roomId: z.string(),
		name: z.string().trim().min(1).max(120),
		defaultAccess: access.default('view'),
	}),
	output: group,
	audit: { target: (i, o) => ({ type: 'group', id: o.id, roomId: i.roomId }) },
	run: (input) => {
		const room = writableRoom(input.roomId);
		const id = newId('grp');
		sqlite()
			.prepare('INSERT INTO groups (id, room_id, name, default_access, created_at) VALUES (?, ?, ?, ?, ?)')
			.run(id, room.id, input.name, input.defaultAccess, Date.now());
		return present(loadGroup(id));
	},
});

export const updateGroup = defineOperation({
	name: 'update_group',
	summary: 'Rename a group or change its default access for top-level items.',
	role: 'admin',
	http: { method: 'PATCH', path: '/groups/{groupId}' },
	input: z.object({
		groupId: z.string(),
		name: z.string().trim().min(1).max(120).optional(),
		defaultAccess: access.optional(),
	}),
	output: group,
	audit: {
		target: (_i, o) => ({ type: 'group', id: o.id, roomId: o.roomId }),
		detail: (i) => ({
			fields: Object.keys(i).filter((k) => k !== 'groupId'),
			defaultAccess: i.defaultAccess,
		}),
	},
	run: (input) => {
		const g = loadGroup(input.groupId);
		writableRoom(g.room_id);
		sqlite()
			.prepare('UPDATE groups SET name = ?, default_access = ? WHERE id = ?')
			.run(input.name ?? g.name, input.defaultAccess ?? g.default_access, g.id);
		return present(loadGroup(g.id));
	},
});

export const deleteGroup = defineOperation({
	name: 'delete_group',
	summary: 'Delete a group. Its links then see the whole room.',
	role: 'admin',
	http: { method: 'DELETE', path: '/groups/{groupId}' },
	input: z.object({ groupId: z.string(), ...confirmField }),
	output: ok.extend({ roomId: z.string() }),
	destructive: (input) => {
		const g = present(loadGroup(input.groupId));
		return `This deletes the group “${g.name}”. Its ${g.linkCount} link(s) will then see the whole room.`;
	},
	audit: { target: (i, o) => ({ type: 'group', id: i.groupId, roomId: o.roomId }) },
	run: (input) => {
		const g = loadGroup(input.groupId);
		writableRoom(g.room_id);
		sqlite().prepare('DELETE FROM groups WHERE id = ?').run(g.id);
		return { ok: true as const, roomId: g.room_id };
	},
});

export const setGroupAccess = defineOperation({
	name: 'set_group_access',
	summary:
		'Choose whether a group sees a folder or file: view, none, or inherit (follow the parent folder or the group default). A folder’s choice covers everything in it, including files added later.',
	role: 'admin',
	http: { method: 'PUT', path: '/groups/{groupId}/access' },
	input: z
		.object({
			groupId: z.string(),
			folderId: z.string().optional(),
			fileId: z.string().optional(),
			access: z.enum(['view', 'none', 'inherit']),
		})
		.refine((v) => !!v.folderId !== !!v.fileId, 'Give either folderId or fileId.'),
	output: ok.extend({ roomId: z.string() }),
	audit: {
		target: (i, o) => ({
			type: i.folderId ? 'folder' : 'file',
			id: (i.folderId ?? i.fileId) as string,
			roomId: o.roomId,
		}),
		detail: (i) => ({ groupId: i.groupId, access: i.access }),
	},
	run: (input) => {
		const g = loadGroup(input.groupId);
		writableRoom(g.room_id);
		const item = input.folderId ? findFolder(input.folderId) : findFile(input.fileId as string);
		if (!item || item.room_id !== g.room_id)
			throw new OpError(400, 'wrong_room', 'That item is not in this group’s room.');
		const column = input.folderId ? 'folder_id' : 'file_id';
		const id = input.folderId ?? input.fileId;
		sqlite().prepare(`DELETE FROM group_permissions WHERE group_id = ? AND ${column} = ?`).run(g.id, id);
		if (input.access !== 'inherit')
			sqlite()
				.prepare(`INSERT INTO group_permissions (id, group_id, ${column}, access) VALUES (?, ?, ?, ?)`)
				.run(newId('gp'), g.id, id, input.access);
		return { ok: true as const, roomId: g.room_id };
	},
});
