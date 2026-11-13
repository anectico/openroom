import { startArchive } from './archive.ts';
import { database } from './db/index.ts';
import { enqueue } from './jobs.ts';
import { releaseObject } from './rooms.ts';
import { abortUnfinishedUpload, deleteStoredKey } from './storage.ts';

const sqlite = () => database().sqlite;

export function eraseViewer(viewerId: string, userId: string) {
	return sqlite()
		.transaction(() => {
			const viewer = sqlite()
				.prepare('SELECT email, name, email_hmac FROM viewers WHERE id = ? AND erased_at IS NULL')
				.get(viewerId) as { email: string | null; name: string | null; email_hmac: string } | undefined;
			if (!viewer) return false;
			const sessions = sqlite().prepare('SELECT id FROM viewer_sessions WHERE viewer_id = ?');
			const sessionIds = new Set((sessions.all(viewerId) as { id: string }[]).map((s) => s.id));
			const rooms = sqlite()
				.prepare(
					`SELECT DISTINCT room_id FROM (
					SELECT l.room_id FROM viewer_sessions s JOIN links l ON l.id = s.link_id WHERE s.viewer_id = ?
					UNION SELECT room_id FROM events WHERE viewer_id = ?
					UNION SELECT room_id FROM conversations WHERE viewer_id = ?
					UNION SELECT room_id FROM page_reads WHERE viewer_id = ?
					UNION SELECT room_id FROM video_reads WHERE viewer_id = ?
					UNION SELECT room_id FROM notices WHERE viewer_id = ?
					UNION SELECT r.room_id FROM file_request_uploads u JOIN file_requests r ON r.id = u.request_id WHERE u.viewer_id = ?
				)`,
				)
				.all(viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId) as { room_id: string }[];
			const roomIds = new Set(rooms.map((r) => r.room_id));
			const references = new Set<string | number>([viewerId, ...sessionIds]);
			for (const table of ['conversations', 'notices']) {
				const rows = sqlite().prepare(`SELECT id FROM ${table} WHERE viewer_id = ?`).all(viewerId) as {
					id: string | number;
				}[];
				for (const row of rows) references.add(row.id);
			}
			const keys = new Set<string>();
			const exports = sqlite()
				.prepare('SELECT id, kind, room_id, requested_by_session, object_key, fingerprint FROM exports')
				.all() as {
				id: string;
				kind: string;
				room_id: string | null;
				requested_by_session: string | null;
				object_key: string | null;
				fingerprint: string | null;
			}[];
			for (const row of exports) {
				if (
					(row.requested_by_session && sessionIds.has(row.requested_by_session)) ||
					(row.kind === 'viewer_data' && (!row.fingerprint || row.fingerprint === viewerId)) ||
					(row.room_id && roomIds.has(row.room_id) && ['csv', 'archive'].includes(row.kind))
				) {
					references.add(row.id);
					if (row.object_key) keys.add(row.object_key);
					sqlite().prepare('DELETE FROM exports WHERE id = ?').run(row.id);
				}
			}
			const uploads = sqlite().prepare('SELECT id, created_by, object_key FROM uploads').all() as {
				id: string;
				created_by: string;
				object_key: string;
			}[];
			for (const row of uploads) {
				if (!row.created_by.startsWith('session:') || !sessionIds.has(row.created_by.slice(8))) continue;
				references.add(row.id);
				keys.add(row.object_key);
				sqlite().prepare('DELETE FROM uploads WHERE id = ?').run(row.id);
			}
			const requestUploads = sqlite()
				.prepare(
					`SELECT id, object_key FROM file_request_uploads WHERE viewer_id = ? OR session_id IN
				(SELECT id FROM viewer_sessions WHERE viewer_id = ?)`,
				)
				.all(viewerId, viewerId) as { id: string; object_key: string }[];
			for (const row of requestUploads) {
				references.add(row.id);
				releaseObject(row.object_key);
			}
			sqlite()
				.prepare("SELECT id FROM file_requests WHERE target_kind = 'viewer' AND target_id = ?")
				.all(viewerId)
				.forEach((row) => {
					references.add((row as { id: string }).id);
				});
			const related = (value: unknown): boolean => {
				if (typeof value === 'string') {
					return references.has(value) || (!!viewer.email && value.toLowerCase().includes(viewer.email));
				}
				if (typeof value === 'number') return references.has(value);
				if (!value || typeof value !== 'object') return false;
				return Object.values(value).some(related);
			};
			const jobs = sqlite()
				.prepare('SELECT id, payload, last_error FROM jobs WHERE schedule_key IS NULL')
				.all() as {
				id: number;
				payload: string;
				last_error: string | null;
			}[];
			for (const row of jobs) {
				if (related(JSON.parse(row.payload)) || related(row.last_error))
					sqlite()
						.prepare(
							"UPDATE jobs SET payload = '{}', last_error = NULL, done_at = ?, failed_at = NULL WHERE id = ?",
						)
						.run(Date.now(), row.id);
			}
			sqlite()
				.prepare('DELETE FROM notice_reads WHERE notice_id IN (SELECT id FROM notices WHERE viewer_id = ?)')
				.run(viewerId);
			sqlite()
				.prepare(
					'DELETE FROM file_request_uploads WHERE viewer_id = ? OR session_id IN (SELECT id FROM viewer_sessions WHERE viewer_id = ?)',
				)
				.run(viewerId, viewerId);
			sqlite()
				.prepare("DELETE FROM file_requests WHERE target_kind = 'viewer' AND target_id = ?")
				.run(viewerId);
			for (const table of [
				'page_reads',
				'video_reads',
				'events',
				'conversations',
				'investor_visits',
				'message_reads',
				'document_reviews',
			]) {
				sqlite()
					.prepare(
						`DELETE FROM ${table} WHERE viewer_id = ? OR session_id IN (SELECT id FROM viewer_sessions WHERE viewer_id = ?)`,
					)
					.run(viewerId, viewerId);
			}
			sqlite().prepare('DELETE FROM notices WHERE viewer_id = ?').run(viewerId);
			if (viewer.name)
				sqlite()
					.prepare("UPDATE links SET label = 'Investor link' WHERE instr(lower(label), ?) > 0")
					.run(viewer.name.toLowerCase());
			if (viewer.email) {
				sqlite()
					.prepare("UPDATE links SET label = 'Investor link' WHERE instr(lower(label), ?) > 0")
					.run(viewer.email);
				sqlite().prepare("DELETE FROM link_allow WHERE kind = 'email' AND value = ?").run(viewer.email);
				sqlite()
					.prepare(
						'DELETE FROM verification_codes WHERE viewer_email = ? OR gate_id IN (SELECT id FROM gate_progress WHERE viewer_email = ?)',
					)
					.run(viewer.email, viewer.email);
				sqlite().prepare('DELETE FROM gate_progress WHERE viewer_email = ?').run(viewer.email);
			}
			sqlite()
				.prepare("UPDATE blocks SET display = NULL WHERE kind = 'email' AND value = ?")
				.run(viewer.email_hmac);
			sqlite().prepare('DELETE FROM viewer_sessions WHERE viewer_id = ?').run(viewerId);
			sqlite()
				.prepare('UPDATE viewers SET email = NULL, name = NULL, erased_at = ? WHERE id = ?')
				.run(Date.now(), viewerId);
			for (const room of rooms) {
				const frozen = sqlite()
					.prepare(
						'SELECT 1 FROM rooms WHERE id = ? AND frozen_at IS NOT NULL AND frozen_at + frozen_retention_days * 86400000 > ?',
					)
					.get(room.room_id, Date.now());
				if (frozen) startArchive(room.room_id, userId);
			}
			if (keys.size) enqueue('privacy.cleanup', { keys: [...keys] });
			return true;
		})
		.immediate();
}

export async function cleanupErasedFiles(payload: unknown) {
	const { keys } = payload as { keys: string[] };
	for (const key of keys) {
		if (sqlite().prepare('SELECT 1 FROM objects WHERE key = ?').get(key)) continue;
		if (sqlite().prepare('SELECT 1 FROM exports WHERE object_key = ?').get(key)) continue;
		if (key.startsWith('files/')) await abortUnfinishedUpload(key);
		await deleteStoredKey(key);
	}
}
