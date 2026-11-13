import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { database } from './db/index.ts';
import { exportTtlMs } from './exports.ts';
import { newId } from './ids.ts';
import { localPath, requireDiskSpace } from './storage.ts';

export function exportViewerData(viewerId: string, userId: string) {
	const sqlite = database().sqlite;
	const all = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).all(...args);
	const viewer = sqlite
		.prepare('SELECT id, email, name, first_seen_at FROM viewers WHERE id = ?')
		.get(viewerId) as
		| { id: string; email: string | null; name: string | null; first_seen_at: number }
		| undefined;
	if (!viewer) return null;
	const data = {
		exportedAt: new Date().toISOString(),
		investor: viewer,
		sessions: all(
			`SELECT s.id, r.name AS room, l.label AS link, s.verified, s.fields_json AS answers, s.ip, s.user_agent, s.created_at, s.last_seen_at, s.ended_at
			FROM viewer_sessions s JOIN links l ON l.id = s.link_id JOIN rooms r ON r.id = l.room_id WHERE s.viewer_id = ? ORDER BY s.created_at`,
			viewerId,
		),
		documentVisits: all(
			'SELECT link_id, baseline_at, baseline_json, seen_at, seen_json FROM investor_visits WHERE viewer_id = ? OR session_id IN (SELECT id FROM viewer_sessions WHERE viewer_id = ?)',
			viewerId,
			viewerId,
		),
		replyReads: all(
			'SELECT message_id, read_at FROM message_reads WHERE viewer_id = ? OR session_id IN (SELECT id FROM viewer_sessions WHERE viewer_id = ?)',
			viewerId,
			viewerId,
		),
		documentReviews: all(
			'SELECT file_id, version, reviewed_at FROM document_reviews WHERE viewer_id = ? OR session_id IN (SELECT id FROM viewer_sessions WHERE viewer_id = ?)',
			viewerId,
			viewerId,
		),
		ndaAcceptances: all(
			'SELECT room_id, name, email, verified, ip, user_agent, accepted_at FROM nda_acceptances WHERE viewer_id = ?',
			viewerId,
		),
		pageReads: all(
			`SELECT p.room_id, f.title AS file, p.page, p.duration_ms, p.first_at, p.last_at FROM page_reads p LEFT JOIN files f ON f.id = p.file_id
			WHERE p.viewer_id = ? ORDER BY p.first_at`,
			viewerId,
		),
		videoReads: all(
			'SELECT v.room_id, f.title AS file, v.watched_ms, v.watched_ranges_json, v.last_at FROM video_reads v LEFT JOIN files f ON f.id = v.file_id WHERE v.viewer_id = ?',
			viewerId,
		),
		events: all(
			'SELECT kind, room_id, file_id, detail_json, at FROM events WHERE viewer_id = ? ORDER BY at',
			viewerId,
		),
		questions: all(
			`SELECT c.id AS thread, c.room_id, c.file_id, c.page, m.author, m.body, m.created_at FROM conversations c
			JOIN messages m ON m.conversation_id = c.id WHERE c.viewer_id = ? OR c.session_id IN (SELECT id FROM viewer_sessions WHERE viewer_id = ?) ORDER BY c.created_at, m.created_at`,
			viewerId,
			viewerId,
		),
		uploads: all(
			`SELECT q.title AS request, u.original_name, u.detected_type, u.size, u.late, u.uploaded_at FROM file_request_uploads u
			JOIN file_requests q ON q.id = u.request_id WHERE u.viewer_id = ? OR u.session_id IN (SELECT id FROM viewer_sessions WHERE viewer_id = ?)`,
			viewerId,
			viewerId,
		),
	};
	const id = newId('exp');
	const key = `exports/${id}.json`;
	const body = Buffer.from(JSON.stringify(data, null, 2));
	requireDiskSpace(body.length);
	mkdirSync(dirname(localPath(key)), { recursive: true });
	writeFileSync(localPath(key), body);
	const now = Date.now();
	sqlite
		.prepare(
			`INSERT INTO exports (id, kind, requested_by_user, status, progress, size, object_key, file_name, fingerprint, created_at, expires_at)
			VALUES (?, 'viewer_data', ?, 'ready', 100, ?, ?, ?, ?, ?, ?)`,
		)
		.run(id, userId, body.length, key, `investor-data-${viewerId}.json`, viewerId, now, now + exportTtlMs);
	return id;
}
