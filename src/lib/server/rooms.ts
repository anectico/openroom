import { database } from './db/index.ts';

export type RoomRow = {
	id: string;
	name: string;
	slug: string;
	defaults_json: string;
	welcome_markdown: string;
	frozen_at: number | null;
	frozen_retention_days: number;
	current_nda_version_id: string | null;
	logo_object_key: string | null;
	accent_color: string | null;
	created_at: number;
};

export type FolderRow = {
	id: string;
	room_id: string;
	parent_id: string | null;
	name: string;
	position: number;
};

export type FileRow = {
	id: string;
	room_id: string;
	folder_id: string | null;
	kind: 'pdf' | 'image' | 'video' | 'download';
	title: string;
	position: number;
	current_version: number;
	created_at: number;
};

export class RoomStateError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

const sqlite = () => database().sqlite;

export function findRoom(id: string) {
	return sqlite().prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined;
}

export function findFolder(id: string) {
	return sqlite().prepare('SELECT * FROM folders WHERE id = ?').get(id) as FolderRow | undefined;
}

export function findFile(id: string) {
	return sqlite().prepare('SELECT * FROM files WHERE id = ?').get(id) as FileRow | undefined;
}

export function assertWritable(room: RoomRow) {
	if (room.frozen_at !== null)
		throw new RoomStateError(
			'frozen',
			'This room is frozen and read only; only its retention and deletion can change.',
		);
}

export function kindFor(contentType: string): FileRow['kind'] {
	if (contentType === 'application/pdf') return 'pdf';
	if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(contentType)) return 'image';
	if (['video/mp4', 'video/webm', 'video/quicktime'].includes(contentType)) return 'video';
	return 'download';
}

export function slugFor(name: string) {
	const base =
		name
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'room';
	let slug = base;
	for (let n = 2; sqlite().prepare('SELECT 1 FROM rooms WHERE slug = ?').get(slug); n++)
		slug = `${base}-${n}`;
	return slug;
}

type Sibling = { type: 'folder' | 'file'; id: string; position: number };

function siblings(roomId: string, parentId: string | null): Sibling[] {
	return sqlite()
		.prepare(
			`SELECT 'folder' AS type, id, position FROM folders WHERE room_id = ? AND parent_id IS ?
			UNION ALL SELECT 'file' AS type, id, position FROM files WHERE room_id = ? AND folder_id IS ?
			ORDER BY position, type DESC, id`,
		)
		.all(roomId, parentId, roomId, parentId) as Sibling[];
}

export function nextPosition(roomId: string, parentId: string | null) {
	const all = siblings(roomId, parentId);
	return all.length ? Math.max(...all.map((s) => s.position)) + 1 : 0;
}

export function place(
	roomId: string,
	parentId: string | null,
	item: { type: 'folder' | 'file'; id: string },
	index?: number,
) {
	const list = siblings(roomId, parentId).filter((s) => !(s.type === item.type && s.id === item.id));
	const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
	list.splice(at, 0, { ...item, position: 0 });
	const folder = sqlite().prepare('UPDATE folders SET position = ?, parent_id = ? WHERE id = ?');
	const file = sqlite().prepare('UPDATE files SET position = ?, folder_id = ? WHERE id = ?');
	for (const [i, s] of list.entries()) {
		if (s.id) (s.type === 'folder' ? folder : file).run(i, parentId, s.id);
	}
}

export function descendantFolderIds(folderId: string) {
	return (
		sqlite()
			.prepare(
				`WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id)
				SELECT id FROM sub`,
			)
			.all(folderId) as { id: string }[]
	).map((r) => r.id);
}

export function retainObject(key: string) {
	sqlite().prepare('UPDATE objects SET refcount = refcount + 1, released_at = NULL WHERE key = ?').run(key);
}

export function releaseObject(key: string) {
	sqlite()
		.prepare(
			'UPDATE objects SET refcount = max(refcount - 1, 0), released_at = CASE WHEN refcount <= 1 THEN ? ELSE released_at END WHERE key = ?',
		)
		.run(Date.now(), key);
}

export function releaseFiles(fileIds: string[]) {
	const versions = sqlite().prepare('SELECT object_key FROM file_versions WHERE file_id = ?');
	for (const id of fileIds) {
		for (const v of versions.all(id) as { object_key: string }[]) releaseObject(v.object_key);
	}
}

export type TreeNode = {
	type: 'folder' | 'file';
	id: string;
	parentId: string | null;
	number: string;
	depth: number;
	name: string;
	kind: FileRow['kind'] | null;
	version: number | null;
	size: number | null;
	contentType: string | null;
};

export function roomTree(roomId: string): TreeNode[] {
	const folders = sqlite()
		.prepare('SELECT id, parent_id, name, position FROM folders WHERE room_id = ?')
		.all(roomId) as Omit<FolderRow, 'room_id'>[];
	const files = sqlite()
		.prepare(
			`SELECT f.id, f.folder_id, f.title, f.kind, f.position, f.current_version, v.size, v.content_type
			FROM files f JOIN file_versions v ON v.file_id = f.id AND v.version = f.current_version
			WHERE f.room_id = ?`,
		)
		.all(roomId) as {
		id: string;
		folder_id: string | null;
		title: string;
		kind: FileRow['kind'];
		position: number;
		current_version: number;
		size: number;
		content_type: string;
	}[];
	const children = new Map<string | null, (TreeNode & { position: number })[]>();
	const push = (parent: string | null, node: TreeNode & { position: number }) => {
		const list = children.get(parent) ?? [];
		list.push(node);
		children.set(parent, list);
	};
	for (const f of folders)
		push(f.parent_id, {
			type: 'folder',
			id: f.id,
			parentId: f.parent_id,
			number: '',
			depth: 0,
			name: f.name,
			kind: null,
			version: null,
			size: null,
			contentType: null,
			position: f.position,
		});
	for (const f of files)
		push(f.folder_id, {
			type: 'file',
			id: f.id,
			parentId: f.folder_id,
			number: '',
			depth: 0,
			name: f.title,
			kind: f.kind,
			version: f.current_version,
			size: f.size,
			contentType: f.content_type,
			position: f.position,
		});
	const out: TreeNode[] = [];
	const walk = (parent: string | null, prefix: string, depth: number) => {
		const list = (children.get(parent) ?? []).sort(
			(a, b) =>
				a.position - b.position ||
				(a.type === b.type ? a.id.localeCompare(b.id) : a.type === 'folder' ? -1 : 1),
		);
		list.forEach((node, i) => {
			const number = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
			const { position: _position, ...rest } = node;
			out.push({ ...rest, number, depth });
			if (node.type === 'folder') walk(node.id, number, depth + 1);
		});
	};
	walk(null, '', 0);
	return out;
}
