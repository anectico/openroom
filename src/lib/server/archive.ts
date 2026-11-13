import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { notify } from './activity.ts';
import { filtersFor, roomFiles, roomInvestors, roomTimeline } from './activity-views.ts';
import { database } from './db/index.ts';
import { newId } from './ids.ts';
import { enqueue } from './jobs.ts';
import { indexCsv, indexPdf } from './room-index.ts';
import { roomTree } from './rooms.ts';
import {
	deleteStoredKey,
	diskMarginBytes,
	freeDiskBytes,
	lazyObjectStream,
	localPath,
	writeLocation,
	writeObject,
} from './storage.ts';
import { writeZip } from './zip.ts';

const sqlite = () => database().sqlite;

const cell = (value: unknown) => {
	let text = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = (rows: unknown[][]) => `${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : '');
const safe = (name: string) =>
	[...name]
		.filter((c) => c.charCodeAt(0) >= 32)
		.join('')
		.replace(/[/\\:*?"<>|]/g, '-')
		.replace(/^\.+/, '')
		.slice(0, 120) || 'untitled';

export function startArchive(roomId: string, userId: string) {
	const room = sqlite()
		.prepare('SELECT name, frozen_at, frozen_retention_days FROM rooms WHERE id = ?')
		.get(roomId) as {
		name: string;
		frozen_at: number;
		frozen_retention_days: number;
	};
	const id = newId('exp');
	sqlite()
		.prepare(
			`INSERT INTO exports (id, kind, room_id, requested_by_user, status, file_name, created_at, expires_at)
			VALUES (?, 'archive', ?, ?, 'pending', ?, ?, ?)`,
		)
		.run(
			id,
			roomId,
			userId,
			`${safe(room.name)} archive.zip`,
			Date.now(),
			room.frozen_at + room.frozen_retention_days * 86_400_000,
		);
	enqueue('export.archive', { exportId: id }, { maxAttempts: 2 });
	return id;
}

function documents(roomId: string, roomName: string) {
	const docs: { name: string; body: Buffer | string }[] = [];
	docs.push({ name: 'index.csv', body: indexCsv(roomId) });
	const audit = sqlite()
		.prepare(
			`SELECT a.at, u.name, a.api_key_id, a.operation, a.target_type, a.target_id, a.detail_json FROM audit_log a
			LEFT JOIN user u ON u.id = a.user_id WHERE a.room_id = ? ORDER BY a.id`,
		)
		.all(roomId) as {
		at: number;
		name: string | null;
		api_key_id: string | null;
		operation: string;
		target_type: string | null;
		target_id: string | null;
		detail_json: string | null;
	}[];
	docs.push({
		name: 'audit-log.csv',
		body: csv([
			['time', 'member', 'api_key', 'operation', 'target_type', 'target_id', 'detail'],
			...audit.map((a) => [
				iso(a.at),
				a.name ?? '',
				a.api_key_id ?? '',
				a.operation,
				a.target_type,
				a.target_id,
				a.detail_json ?? '',
			]),
		]),
	});
	const messages = sqlite()
		.prepare(
			`SELECT c.id, v.email, f.title, c.page, m.author, u.name AS member, m.body, m.created_at FROM conversations c
			JOIN messages m ON m.conversation_id = c.id LEFT JOIN viewers v ON v.id = c.viewer_id LEFT JOIN files f ON f.id = c.file_id
			LEFT JOIN user u ON u.id = m.author WHERE c.room_id = ? ORDER BY c.created_at, m.created_at`,
		)
		.all(roomId) as {
		id: string;
		email: string | null;
		title: string | null;
		page: number | null;
		author: string;
		member: string | null;
		body: string;
		created_at: number;
	}[];
	docs.push({
		name: 'questions.csv',
		body: csv([
			['thread', 'investor', 'file', 'page', 'from', 'time', 'message'],
			...messages.map((m) => [
				m.id,
				m.email ?? '',
				m.title ?? '',
				m.page ?? '',
				m.author === 'viewer' ? 'investor' : (m.member ?? 'member'),
				iso(m.created_at),
				m.body,
			]),
		]),
	});
	const faq = sqlite()
		.prepare('SELECT question, answer_markdown FROM faq_entries WHERE room_id = ? ORDER BY position')
		.all(roomId) as {
		question: string;
		answer_markdown: string;
	}[];
	docs.push({
		name: 'faq.md',
		body: faq.map((f) => `## ${f.question}\n\n${f.answer_markdown}\n`).join('\n') || 'No FAQ entries.\n',
	});
	const f = filtersFor(roomId, {});
	const investors = roomInvestors(roomId, f);
	docs.push({
		name: 'activity/investors.csv',
		body: csv([
			['email', 'verified', 'firm', 'visits', 'files', 'seconds', 'downloads', 'last_seen'],
			...investors.map((i) => [
				i.email,
				i.verified,
				i.firm,
				i.visits,
				i.files,
				Math.round(i.timeMs / 1000),
				i.downloads,
				iso(i.lastSeenAt),
			]),
		]),
	});
	docs.push({
		name: 'activity/files.csv',
		body: csv([
			['number', 'title', 'viewers', 'total_seconds', 'average_seconds'],
			...roomFiles(roomId, f).map((x) => [
				x.number,
				x.title,
				x.viewers,
				Math.round(x.totalMs / 1000),
				Math.round(x.avgMs / 1000),
			]),
		]),
	});
	docs.push({
		name: 'activity/timeline.csv',
		body: csv([
			['time', 'event', 'email', 'file'],
			...roomTimeline(roomId, f, 1_000_000).map((e) => [iso(e.at), e.kind, e.email, e.fileTitle]),
		]),
	});
	const ndas = sqlite()
		.prepare(
			`SELECT a.name, a.email, a.verified, a.ip, a.accepted_at, v.created_at AS version_at FROM nda_acceptances a
			LEFT JOIN nda_versions v ON v.id = a.nda_version_id WHERE a.room_id = ? ORDER BY a.accepted_at`,
		)
		.all(roomId) as {
		name: string;
		email: string;
		verified: number;
		ip: string | null;
		accepted_at: number;
		version_at: number | null;
	}[];
	docs.push({
		name: 'nda-acceptances.csv',
		body: csv([
			['name', 'email', 'verified', 'ip', 'accepted_at', 'nda_version_of'],
			...ndas.map((n) => [n.name, n.email, !!n.verified, n.ip ?? '', iso(n.accepted_at), iso(n.version_at)]),
		]),
	});
	docs.push({
		name: 'README.txt',
		body: `Archive of the data room "${roomName}", made ${new Date().toISOString()}.\n\nfiles/ holds every file's current version, numbered as in the room.\nmanifest.sha256 lists the SHA-256 of every other entry; check it with: sha256sum -c manifest.sha256\n`,
	});
	return docs;
}

export async function runArchive(payload: unknown) {
	const { exportId } = payload as { exportId: string };
	const row = sqlite().prepare('SELECT * FROM exports WHERE id = ?').get(exportId) as
		| { room_id: string; status: string }
		| undefined;
	if (!row || row.status === 'ready') return;
	const room = sqlite().prepare('SELECT name FROM rooms WHERE id = ?').get(row.room_id) as
		| { name: string }
		| undefined;
	if (!room) return;
	const key = `exports/archive/${row.room_id}/${Date.now()}-${exportId}.zip`;
	const path = localPath(key);
	const fail = (message: string) =>
		sqlite().prepare("UPDATE exports SET status = 'failed', error = ? WHERE id = ?").run(message, exportId);
	try {
		const tree = roomTree(row.room_id);
		const byId = new Map(tree.map((n) => [n.id, n]));
		const fileRows = tree
			.filter((n) => n.type === 'file')
			.map((n) => {
				const v = sqlite()
					.prepare(
						`SELECT v.object_key, v.original_name, v.size, o.sha256 FROM files f JOIN file_versions v ON v.file_id = f.id AND v.version = f.current_version
						JOIN objects o ON o.key = v.object_key WHERE f.id = ?`,
					)
					.get(n.id) as { object_key: string; original_name: string; size: number; sha256: string };
				const ext = v.original_name.slice(v.original_name.lastIndexOf('.'));
				const parts = [
					`${n.number} ${safe(n.name)}${/^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext.toLowerCase() : ''}`,
				];
				for (
					let p = n.parentId ? byId.get(n.parentId) : undefined;
					p;
					p = p.parentId ? byId.get(p.parentId) : undefined
				)
					parts.unshift(`${p.number} ${safe(p.name)}`);
				return { path: `files/${parts.join('/')}`, key: v.object_key, size: v.size, sha256: v.sha256 };
			});
		const total = fileRows.reduce((s, f) => s + f.size, 0);
		if (freeDiskBytes() < total + diskMarginBytes) {
			fail('The server does not have enough free disk space for the archive.');
			return;
		}
		const docs = documents(row.room_id, room.name);
		docs.push({ name: 'index.pdf', body: await indexPdf(row.room_id, room.name) });
		const manifest = [
			...fileRows.map((f) => `${f.sha256}  ${f.path}`),
			...docs.map((d) => `${createHash('sha256').update(d.body).digest('hex')}  ${d.name}`),
		];
		mkdirSync(dirname(path), { recursive: true });
		sqlite()
			.prepare("UPDATE exports SET status = 'running', error = NULL, object_key = ? WHERE id = ?")
			.run(key, exportId);
		await writeZip(
			path,
			[
				...fileRows.map((file) => ({ name: file.path, source: lazyObjectStream(file.key), store: true })),
				...docs.map((document) => ({ name: document.name, source: document.body })),
				{ name: 'manifest.sha256', source: `${manifest.join('\n')}\n` },
			],
			{ zlib: { level: 6 } },
		);
		if (writeLocation() === 's3') await writeObject(key, createReadStream(path), statSync(path).size, 's3');
		const saved = sqlite()
			.prepare("UPDATE exports SET status = 'ready', progress = 100, size = ? WHERE id = ?")
			.run(statSync(path).size, exportId);
		if (!saved.changes) {
			await deleteStoredKey(key);
			return;
		}
		notify('archive_ready', { roomId: row.room_id });
	} catch (error) {
		rmSync(path, { force: true });
		console.error(`archive ${exportId} failed`, error);
		fail('The archive could not be built.');
		throw new Error('The archive could not be built.');
	}
}

export function latestArchive(roomId: string) {
	return sqlite()
		.prepare("SELECT * FROM exports WHERE kind = 'archive' AND room_id = ? ORDER BY created_at DESC LIMIT 1")
		.get(roomId) as
		| {
				id: string;
				status: string;
				progress: number;
				size: number | null;
				error: string | null;
				object_key: string | null;
				file_name: string;
				expires_at: number;
		  }
		| undefined;
}
