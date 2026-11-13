import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { database } from './db/index.ts';
import { newId } from './ids.ts';
import { enqueue } from './jobs.ts';
import { roomTree, type TreeNode } from './rooms.ts';
import { sha256 } from './secrets.ts';
import { deleteStoredKey, diskMarginBytes, freeDiskBytes, lazyObjectStream, localPath } from './storage.ts';
import { visibleTree } from './viewer/access.ts';
import { writeZip } from './zip.ts';

export const exportTtlMs = 24 * 60 * 60_000;
const maxBuildingPerScope = 2;
const maxBuildingTotal = 5;

export type ExportRow = {
	id: string;
	kind: string;
	room_id: string | null;
	link_id: string | null;
	requested_by_user: string | null;
	requested_by_session: string | null;
	status: 'pending' | 'running' | 'ready' | 'failed';
	progress: number;
	size: number | null;
	error: string | null;
	object_key: string | null;
	file_name: string;
	fingerprint: string | null;
	created_at: number;
	expires_at: number;
};

export class ExportBusyError extends Error {}

const sqlite = () => database().sqlite;

function safeName(name: string) {
	return (
		[...name]
			.filter((c) => c.charCodeAt(0) >= 32)
			.join('')
			.replace(/[/\\:*?"<>|]/g, '-')
			.replace(/^\.+/, '')
			.trim()
			.slice(0, 120) || 'untitled'
	);
}

function extension(name: string) {
	const ext = name.slice(name.lastIndexOf('.'));
	return /^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext.toLowerCase() : '';
}

export function findExport(id: string) {
	return sqlite().prepare('SELECT * FROM exports WHERE id = ?').get(id) as ExportRow | undefined;
}

type Entry = { path: string; key: string; size: number };

function entries(tree: TreeNode[]): Entry[] {
	const byId = new Map(tree.map((n) => [n.id, n]));
	const files = sqlite().prepare(
		`SELECT v.object_key, v.original_name, v.size FROM files f
		JOIN file_versions v ON v.file_id = f.id AND v.version = f.current_version WHERE f.id = ?`,
	);
	const out: Entry[] = [];
	for (const n of tree) {
		if (n.type !== 'file') continue;
		const v = files.get(n.id) as { object_key: string; original_name: string; size: number } | undefined;
		if (!v) continue;
		const parts = [`${n.number} ${safeName(n.name)}${extension(v.original_name)}`];
		for (
			let p = n.parentId ? byId.get(n.parentId) : undefined;
			p;
			p = p.parentId ? byId.get(p.parentId) : undefined
		)
			parts.unshift(`${p.number} ${safeName(p.name)}`);
		out.push({ path: parts.join('/'), key: v.object_key, size: v.size });
	}
	return out;
}

function contents(roomId: string, linkId: string | null) {
	const list = entries(linkId ? visibleTree(roomId, linkId) : roomTree(roomId));
	const fingerprint = sha256(list.map((e) => `${e.path}\u0000${e.key}`).join('\n'));
	return { list, fingerprint };
}

export function exportStillValid(row: ExportRow) {
	if (row.kind !== 'zip') return true;
	if (!row.room_id || !row.fingerprint) return false;
	return contents(row.room_id, row.link_id).fingerprint === row.fingerprint;
}

export function createZipExport(input: {
	roomId: string;
	roomName: string;
	linkId: string | null;
	userId: string | null;
	sessionId: string | null;
}) {
	const now = Date.now();
	const { fingerprint } = contents(input.roomId, input.linkId);
	const mine = sqlite()
		.prepare(
			`SELECT * FROM exports WHERE kind = 'zip' AND room_id = ? AND link_id IS ? AND requested_by_session IS ? AND requested_by_user IS ?
			AND fingerprint = ? AND status IN ('pending', 'running', 'ready') AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
		)
		.get(input.roomId, input.linkId, input.sessionId, input.userId, fingerprint, now) as
		| ExportRow
		| undefined;
	if (mine) return mine;
	const shared = sqlite()
		.prepare(
			`SELECT * FROM exports WHERE kind = 'zip' AND room_id = ? AND link_id IS ? AND fingerprint = ? AND status = 'ready'
			AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
		)
		.get(input.roomId, input.linkId, fingerprint, now) as ExportRow | undefined;
	const insert = (
		status: 'pending' | 'ready',
		objectKey: string | null,
		size: number | null,
		expiresAt: number,
	) => {
		const id = newId('exp');
		sqlite()
			.prepare(
				`INSERT INTO exports (id, kind, room_id, link_id, requested_by_user, requested_by_session, status, progress, size, object_key, file_name, fingerprint, created_at, expires_at)
				VALUES (?, 'zip', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				input.roomId,
				input.linkId,
				input.userId,
				input.sessionId,
				status,
				status === 'ready' ? 100 : 0,
				size,
				objectKey,
				`${safeName(input.roomName)}.zip`,
				fingerprint,
				now,
				expiresAt,
			);
		return id;
	};
	if (shared)
		return findExport(insert('ready', shared.object_key, shared.size, shared.expires_at)) as ExportRow;
	const building = (sql: string, ...args: unknown[]) =>
		(
			sqlite()
				.prepare(sql)
				.get(...args) as { n: number }
		).n;
	if (
		building(
			"SELECT count(*) AS n FROM exports WHERE status IN ('pending', 'running') AND expires_at > ? AND room_id = ? AND link_id IS ?",
			now,
			input.roomId,
			input.linkId,
		) >= maxBuildingPerScope ||
		building(
			"SELECT count(*) AS n FROM exports WHERE status IN ('pending', 'running') AND expires_at > ?",
			now,
		) >= maxBuildingTotal
	)
		throw new ExportBusyError('Other zips are being prepared. Try again in a few minutes.');
	const id = insert('pending', null, null, now + exportTtlMs);
	enqueue('export.zip', { exportId: id }, { maxAttempts: 2 });
	return findExport(id) as ExportRow;
}

export async function runZipExport(payload: unknown) {
	const { exportId } = payload as { exportId: string };
	const row = findExport(exportId);
	if (!row || row.status === 'ready' || !row.room_id || row.expires_at <= Date.now()) return;
	const key = `exports/${exportId}.zip`;
	const path = localPath(key);
	const fail = (error: string) =>
		sqlite().prepare("UPDATE exports SET status = 'failed', error = ? WHERE id = ?").run(error, exportId);
	try {
		const { list, fingerprint } = contents(row.room_id, row.link_id);
		const total = list.reduce((sum, e) => sum + e.size, 0);
		if (freeDiskBytes() < total + diskMarginBytes) {
			fail('The server does not have enough free disk space for this zip.');
			return;
		}
		mkdirSync(dirname(path), { recursive: true });
		sqlite()
			.prepare(
				"UPDATE exports SET status = 'running', error = NULL, object_key = ?, progress = 0, fingerprint = ? WHERE id = ?",
			)
			.run(key, fingerprint, exportId);
		let done = 0;
		await writeZip(
			path,
			list.map((entry) => ({ name: entry.path, source: lazyObjectStream(entry.key) })),
			{ store: true },
			() => {
				done++;
				sqlite()
					.prepare('UPDATE exports SET progress = ? WHERE id = ?')
					.run(Math.round((done / Math.max(1, list.length)) * 100), exportId);
			},
		);
		const saved = sqlite()
			.prepare("UPDATE exports SET status = 'ready', progress = 100, size = ? WHERE id = ?")
			.run(statSync(path).size, exportId);
		if (!saved.changes) rmSync(path, { force: true });
	} catch (error) {
		rmSync(path, { force: true });
		console.error(`zip ${exportId} failed`, error);
		fail('The zip could not be built.');
		throw new Error('The zip could not be built.');
	}
}

export async function cleanupExports() {
	const now = Date.now();
	const rows = sqlite()
		.prepare(
			"SELECT id, object_key FROM exports WHERE expires_at < ? OR (status = 'failed' AND created_at < ?)",
		)
		.all(now, now - 60 * 60_000) as { id: string; object_key: string | null }[];
	for (const r of rows) {
		if (r.object_key) {
			const inUse = sqlite()
				.prepare('SELECT 1 FROM exports WHERE object_key = ? AND id != ?')
				.get(r.object_key, r.id);
			if (!inUse) await deleteStoredKey(r.object_key);
		}
		sqlite().prepare('DELETE FROM exports WHERE id = ? AND object_key IS ?').run(r.id, r.object_key);
	}
}
