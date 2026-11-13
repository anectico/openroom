import { database } from './db/index.ts';
import { newId } from './ids.ts';
import { retainObject, slugFor } from './rooms.ts';

export function duplicateRoom(sourceId: string, name: string) {
	const sqlite = database().sqlite;
	return sqlite
		.transaction(() => {
			const src = sqlite.prepare('SELECT * FROM rooms WHERE id = ?').get(sourceId) as {
				defaults_json: string;
				logo_object_key: string | null;
				accent_color: string | null;
				welcome_markdown: string;
				current_nda_version_id: string | null;
			};
			const roomId = newId('room');
			const now = Date.now();
			sqlite
				.prepare(
					'INSERT INTO rooms (id, name, slug, defaults_json, logo_object_key, accent_color, welcome_markdown, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
				)
				.run(
					roomId,
					name,
					slugFor(name),
					src.defaults_json,
					src.logo_object_key,
					src.accent_color,
					src.welcome_markdown,
					now,
				);
			if (src.logo_object_key) retainObject(src.logo_object_key);
			const folderIds = new Map<string, string>();
			const folders = sqlite
				.prepare('SELECT * FROM folders WHERE room_id = ? ORDER BY parent_id IS NOT NULL, created_at')
				.all(sourceId) as { id: string; parent_id: string | null; name: string; position: number }[];
			const pending = [...folders];
			while (pending.length) {
				const next = pending.findIndex((f) => !f.parent_id || folderIds.has(f.parent_id));
				const f = pending.splice(Math.max(next, 0), 1)[0];
				const id = newId('fld');
				folderIds.set(f.id, id);
				sqlite
					.prepare(
						'INSERT INTO folders (id, room_id, parent_id, name, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
					)
					.run(
						id,
						roomId,
						f.parent_id ? (folderIds.get(f.parent_id) ?? null) : null,
						f.name,
						f.position,
						now,
					);
			}
			const fileIds = new Map<string, string>();
			const files = sqlite.prepare('SELECT * FROM files WHERE room_id = ?').all(sourceId) as {
				id: string;
				folder_id: string | null;
				kind: string;
				title: string;
				position: number;
				current_version: number;
			}[];
			const versions = sqlite.prepare('SELECT * FROM file_versions WHERE file_id = ? AND deleted_at IS NULL');
			for (const f of files) {
				const id = newId('file');
				fileIds.set(f.id, id);
				sqlite
					.prepare(
						'INSERT INTO files (id, room_id, folder_id, kind, title, position, current_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
					)
					.run(
						id,
						roomId,
						f.folder_id ? folderIds.get(f.folder_id) : null,
						f.kind,
						f.title,
						f.position,
						f.current_version,
						now,
					);
				for (const v of versions.all(f.id) as Record<string, unknown>[]) {
					sqlite
						.prepare(
							`INSERT INTO file_versions (id, file_id, version, object_key, original_name, content_type, size, pages, duration_ms, created_by, created_at)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						)
						.run(
							newId('ver'),
							id,
							v.version,
							v.object_key,
							v.original_name,
							v.content_type,
							v.size,
							v.pages,
							v.duration_ms,
							v.created_by,
							v.created_at,
						);
					retainObject(String(v.object_key));
				}
			}
			for (const pin of sqlite
				.prepare('SELECT file_id, position FROM room_pins WHERE room_id = ? ORDER BY position')
				.all(sourceId) as { file_id: string; position: number }[]) {
				const fileId = fileIds.get(pin.file_id);
				if (fileId)
					sqlite
						.prepare('INSERT INTO room_pins (room_id, file_id, position) VALUES (?, ?, ?)')
						.run(roomId, fileId, pin.position);
			}
			const groups = sqlite.prepare('SELECT * FROM groups WHERE room_id = ?').all(sourceId) as {
				id: string;
				name: string;
				default_access: string;
			}[];
			for (const g of groups) {
				const id = newId('grp');
				sqlite
					.prepare(
						'INSERT INTO groups (id, room_id, name, default_access, created_at) VALUES (?, ?, ?, ?, ?)',
					)
					.run(id, roomId, g.name, g.default_access, now);
				for (const p of sqlite.prepare('SELECT * FROM group_permissions WHERE group_id = ?').all(g.id) as {
					folder_id: string | null;
					file_id: string | null;
					access: string;
				}[]) {
					const folder = p.folder_id ? folderIds.get(p.folder_id) : null;
					const file = p.file_id ? fileIds.get(p.file_id) : null;
					if (!folder && !file) continue;
					sqlite
						.prepare(
							'INSERT INTO group_permissions (id, group_id, folder_id, file_id, access) VALUES (?, ?, ?, ?, ?)',
						)
						.run(newId('gp'), id, folder ?? null, file ?? null, p.access);
				}
			}
			if (src.current_nda_version_id) {
				const nda = sqlite
					.prepare('SELECT body_markdown, created_by FROM nda_versions WHERE id = ?')
					.get(src.current_nda_version_id) as
					| { body_markdown: string; created_by: string | null }
					| undefined;
				if (nda) {
					const id = newId('ndav');
					sqlite
						.prepare(
							'INSERT INTO nda_versions (id, room_id, body_markdown, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
						)
						.run(id, roomId, nda.body_markdown, nda.created_by, now);
					sqlite.prepare('UPDATE rooms SET current_nda_version_id = ? WHERE id = ?').run(id, roomId);
				}
			}
			return roomId;
		})
		.immediate();
}
