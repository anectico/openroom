import { database } from './db/index.ts';
import { roomTree } from './rooms.ts';
import { checkSessionId } from './viewer/access.ts';

const sqlite = () => database().sqlite;

const freeMail = new Set([
	'gmail.com',
	'googlemail.com',
	'outlook.com',
	'hotmail.com',
	'live.com',
	'msn.com',
	'yahoo.com',
	'ymail.com',
	'icloud.com',
	'me.com',
	'mac.com',
	'aol.com',
	'proton.me',
	'protonmail.com',
	'pm.me',
	'gmx.com',
	'gmx.de',
	'gmx.net',
	'web.de',
	'mail.com',
	'mail.ru',
	'yandex.ru',
	'yandex.com',
	'qq.com',
	'163.com',
	'126.com',
	'zoho.com',
	'fastmail.com',
	'hey.com',
	'tutanota.com',
]);

export function firmOf(email: string | null) {
	if (!email) return null;
	const domain = email.slice(email.lastIndexOf('@') + 1);
	return freeMail.has(domain) ? null : domain;
}

export type Filters = { linkIds: string[] | null; from: number; to: number };

export function filtersFor(
	roomId: string,
	input: { linkId?: string; groupId?: string; from?: number; to?: number },
): Filters {
	let linkIds: string[] | null = null;
	if (input.linkId) linkIds = [input.linkId];
	if (input.groupId) {
		const groupLinks = (
			sqlite()
				.prepare(
					'SELECT lg.link_id FROM link_groups lg JOIN links l ON l.id = lg.link_id WHERE lg.group_id = ? AND l.room_id = ?',
				)
				.all(input.groupId, roomId) as { link_id: string }[]
		).map((r) => r.link_id);
		linkIds = linkIds ? linkIds.filter((id) => groupLinks.includes(id)) : groupLinks;
	}
	return { linkIds, from: input.from ?? 0, to: input.to ?? Date.now() + 60_000 };
}

function scope(f: Filters, column = 'session_id') {
	if (!f.linkIds) return { sql: '', args: [] as string[] };
	const marks = f.linkIds.map(() => '?').join(',') || "''";
	return {
		sql: `AND ${column} IN (SELECT id FROM viewer_sessions WHERE link_id IN (${marks}))`,
		args: f.linkIds,
	};
}

export type InvestorRow = {
	viewerId: string;
	email: string | null;
	verified: boolean;
	firm: string | null;
	fields: Record<string, string> | null;
	visits: number;
	files: number;
	timeMs: number;
	downloads: number;
	lastSeenAt: number;
};

export function roomInvestors(roomId: string, f: Filters): InvestorRow[] {
	const links = f.linkIds ? `AND s.link_id IN (${f.linkIds.map(() => '?').join(',') || "''"})` : '';
	const answerLinks = f.linkIds ? `AND s2.link_id IN (${f.linkIds.map(() => '?').join(',') || "''"})` : '';
	const rows = sqlite()
		.prepare(
			`SELECT v.id AS viewerId, v.email, max(s.verified) AS verified, count(DISTINCT s.id) AS visits, max(s.last_seen_at) AS lastSeenAt,
				(SELECT s2.fields_json FROM viewer_sessions s2 JOIN links l2 ON l2.id = s2.link_id
					WHERE s2.viewer_id = v.id AND l2.room_id = ? AND s2.fields_json IS NOT NULL AND s2.last_seen_at >= ? AND s2.created_at <= ? ${answerLinks} ORDER BY s2.created_at DESC LIMIT 1) AS fields
			FROM viewer_sessions s JOIN links l ON l.id = s.link_id JOIN viewers v ON v.id = s.viewer_id
			WHERE l.room_id = ? AND s.preview_by IS NULL AND s.last_seen_at >= ? AND s.created_at <= ? ${links}
			GROUP BY v.id ORDER BY lastSeenAt DESC`,
		)
		.all(roomId, f.from, f.to, ...(f.linkIds ?? []), roomId, f.from, f.to, ...(f.linkIds ?? [])) as (Omit<
		InvestorRow,
		'firm' | 'fields' | 'verified' | 'files' | 'timeMs' | 'downloads'
	> & { verified: number; fields: string | null })[];
	const s = scope(f);
	const reads = new Map<string, { ms: number; files: Set<string> }>();
	const add = (viewerId: string, fileId: string, ms: number) => {
		const r = reads.get(viewerId) ?? { ms: 0, files: new Set<string>() };
		r.ms += ms;
		r.files.add(fileId);
		reads.set(viewerId, r);
	};
	for (const r of sqlite()
		.prepare(
			`SELECT viewer_id, file_id, sum(duration_ms) AS ms FROM page_reads WHERE room_id = ? AND last_at BETWEEN ? AND ? ${s.sql} GROUP BY viewer_id, file_id`,
		)
		.all(roomId, f.from, f.to, ...s.args) as { viewer_id: string; file_id: string; ms: number }[])
		add(r.viewer_id, r.file_id, r.ms);
	for (const r of sqlite()
		.prepare(
			`SELECT viewer_id, file_id, sum(watched_ms) AS ms FROM video_reads WHERE room_id = ? AND last_at BETWEEN ? AND ? ${s.sql} GROUP BY viewer_id, file_id`,
		)
		.all(roomId, f.from, f.to, ...s.args) as { viewer_id: string; file_id: string; ms: number }[])
		add(r.viewer_id, r.file_id, r.ms);
	const linkFilter = f.linkIds ? `AND link_id IN (${f.linkIds.map(() => '?').join(',') || "''"})` : '';
	const downloads = new Map(
		(
			sqlite()
				.prepare(
					`SELECT viewer_id, count(*) AS n FROM events WHERE room_id = ? AND kind IN ('download', 'zip_download') AND at BETWEEN ? AND ? ${linkFilter} GROUP BY viewer_id`,
				)
				.all(roomId, f.from, f.to, ...(f.linkIds ?? [])) as { viewer_id: string; n: number }[]
		).map((r) => [r.viewer_id, r.n]),
	);
	return rows.map((r) => ({
		...r,
		verified: !!r.verified,
		firm: firmOf(r.email),
		fields: r.fields ? JSON.parse(r.fields) : null,
		files: reads.get(r.viewerId)?.files.size ?? 0,
		timeMs: reads.get(r.viewerId)?.ms ?? 0,
		downloads: downloads.get(r.viewerId) ?? 0,
	}));
}

export function roomFirms(investors: InvestorRow[]) {
	const firms = new Map<
		string,
		{ firm: string; viewers: number; visits: number; timeMs: number; downloads: number; lastSeenAt: number }
	>();
	for (const i of investors) {
		if (!i.firm) continue;
		const f = firms.get(i.firm) ?? {
			firm: i.firm,
			viewers: 0,
			visits: 0,
			timeMs: 0,
			downloads: 0,
			lastSeenAt: 0,
		};
		f.viewers++;
		f.visits += i.visits;
		f.timeMs += i.timeMs;
		f.downloads += i.downloads;
		f.lastSeenAt = Math.max(f.lastSeenAt, i.lastSeenAt);
		firms.set(i.firm, f);
	}
	return [...firms.values()].sort((a, b) => b.timeMs - a.timeMs);
}

export function roomFiles(roomId: string, f: Filters) {
	const { sql: within, args } = scope(f);
	const files = roomTree(roomId).filter((n) => n.type === 'file');
	const pages = sqlite().prepare(
		`SELECT r.page, sum(r.duration_ms) AS ms, count(DISTINCT r.viewer_id) AS viewers FROM page_reads r
		JOIN file_versions v ON v.id = r.file_version_id AND v.version = ?
		WHERE r.file_id = ? AND r.room_id = ? AND r.last_at BETWEEN ? AND ? ${within.replace('session_id', 'r.session_id')} GROUP BY r.page ORDER BY r.page`,
	);
	const totals = sqlite().prepare(
		`SELECT count(DISTINCT viewer_id) AS viewers, coalesce(sum(ms), 0) AS ms FROM (
			SELECT viewer_id, duration_ms AS ms FROM page_reads WHERE file_id = ? AND room_id = ? AND last_at BETWEEN ? AND ? ${within}
			UNION ALL SELECT viewer_id, watched_ms AS ms FROM video_reads WHERE file_id = ? AND room_id = ? AND last_at BETWEEN ? AND ? ${within})`,
	);
	const versions = sqlite().prepare(
		`SELECT DISTINCT v.version FROM page_reads r JOIN file_versions v ON v.id = r.file_version_id
		WHERE r.file_id = ? AND r.room_id = ? AND r.last_at BETWEEN ? AND ? ${within.replace('session_id', 'r.session_id')}
		UNION SELECT DISTINCT v.version FROM video_reads r JOIN file_versions v ON v.id = r.file_version_id
		WHERE r.file_id = ? AND r.room_id = ? AND r.last_at BETWEEN ? AND ? ${within.replace('session_id', 'r.session_id')} ORDER BY 1`,
	);
	const video = sqlite().prepare(
		`SELECT r.viewer_id AS viewerId, r.watched_ranges_json AS ranges, r.duration_ms AS duration FROM video_reads r
		JOIN file_versions v ON v.id = r.file_version_id AND v.version = ?
		WHERE r.file_id = ? AND r.room_id = ? AND r.last_at BETWEEN ? AND ? ${within.replace('session_id', 'r.session_id')}`,
	);
	const meta = sqlite().prepare(
		'SELECT v.pages FROM files f JOIN file_versions v ON v.file_id = f.id AND v.version = f.current_version WHERE f.id = ?',
	);
	return files.map((file) => {
		const t = totals.get(file.id, roomId, f.from, f.to, ...args, file.id, roomId, f.from, f.to, ...args) as {
			viewers: number;
			ms: number;
		};
		let watched: number[] | null = null;
		if (file.kind === 'video') {
			const buckets = Array.from({ length: 10 }, () => new Set<string>());
			const rows = video.all(file.version, file.id, roomId, f.from, f.to, ...args) as {
				viewerId: string | null;
				ranges: string;
				duration: number | null;
			}[];
			for (const r of rows) {
				if (!r.duration || !r.viewerId) continue;
				for (const [a, b] of JSON.parse(r.ranges) as [number, number][])
					for (let i = 0; i < 10; i++)
						if (a < ((i + 1) * r.duration) / 10 && b > (i * r.duration) / 10) buckets[i].add(r.viewerId);
			}
			watched = buckets.map((bucket) => bucket.size);
		}
		return {
			fileId: file.id,
			number: file.number,
			title: file.name,
			kind: file.kind,
			pages: (meta.get(file.id) as { pages: number | null } | undefined)?.pages ?? null,
			viewers: t.viewers,
			totalMs: t.ms,
			avgMs: t.viewers ? Math.round(t.ms / t.viewers) : 0,
			versionsRead: (
				versions.all(file.id, roomId, f.from, f.to, ...args, file.id, roomId, f.from, f.to, ...args) as {
					version: number;
				}[]
			).map((v) => v.version),
			perPage:
				file.kind === 'pdf'
					? (pages.all(file.version, file.id, roomId, f.from, f.to, ...args) as {
							page: number;
							ms: number;
							viewers: number;
						}[])
					: [],
			videoWatchedByTenth: watched,
		};
	});
}

export function roomTimeline(roomId: string, f: Filters, limit = 300) {
	const links = f.linkIds ? `AND e.link_id IN (${f.linkIds.map(() => '?').join(',') || "''"})` : '';
	return sqlite()
		.prepare(
			`SELECT e.id, e.kind, e.at, e.viewer_id AS viewerId, v.email, e.file_id AS fileId, fi.title AS fileTitle, rq.title AS requestTitle, e.link_id AS linkId
			FROM events e LEFT JOIN viewers v ON v.id = e.viewer_id LEFT JOIN files fi ON fi.id = e.file_id
			LEFT JOIN file_requests rq ON rq.id = json_extract(e.detail_json, '$.requestId')
			WHERE e.room_id = ? AND e.at BETWEEN ? AND ? ${links} ORDER BY e.at DESC LIMIT ?`,
		)
		.all(roomId, f.from, f.to, ...(f.linkIds ?? []), limit) as {
		id: number;
		kind: string;
		at: number;
		viewerId: string | null;
		email: string | null;
		fileId: string | null;
		fileTitle: string | null;
		requestTitle: string | null;
		linkId: string | null;
	}[];
}

export function viewingNow(roomId?: string, filters?: Filters) {
	const within = filters ? scope(filters, 's.id') : { sql: '', args: [] };
	const rows = sqlite()
		.prepare(
			`SELECT s.id AS sessionId, v.id AS viewerId, v.email, l.room_id AS roomId, r.name AS roomName, s.last_beacon_at AS at,
				(SELECT f.title FROM (SELECT file_id, last_at FROM page_reads WHERE session_id = s.id
					UNION ALL SELECT file_id, last_at FROM video_reads WHERE session_id = s.id) x
					JOIN files f ON f.id = x.file_id ORDER BY x.last_at DESC LIMIT 1) AS fileTitle
			FROM viewer_sessions s JOIN links l ON l.id = s.link_id JOIN rooms r ON r.id = l.room_id JOIN viewers v ON v.id = s.viewer_id
			WHERE s.preview_by IS NULL AND s.ended_at IS NULL AND s.last_beacon_at > ? AND (? IS NULL OR l.room_id = ?)
			AND s.last_beacon_at BETWEEN ? AND ? ${within.sql}
			ORDER BY s.last_beacon_at DESC`,
		)
		.all(
			Date.now() - 60_000,
			roomId ?? null,
			roomId ?? null,
			filters?.from ?? 0,
			filters?.to ?? Date.now() + 60_000,
			...within.args,
		) as {
		sessionId: string;
		viewerId: string;
		email: string | null;
		roomId: string;
		roomName: string;
		at: number;
		fileTitle: string | null;
	}[];
	return rows.filter((row) => {
		const check = checkSessionId(row.sessionId, { touch: false });
		return check.ok && !check.ctx.needsNda;
	});
}

export type ViewerReading = {
	roomId: string;
	fileId: string;
	title: string | null;
	pages: number;
	timeMs: number;
	lastAt: number;
	versions: {
		fileVersionId: string;
		version: number | null;
		pageCount: number | null;
		current: boolean;
		timeMs: number;
		lastAt: number;
		perPage: { page: number; timeMs: number; lastAt: number }[];
		video: { durationMs: number | null; ranges: [number, number][] } | null;
	}[];
};

export function viewerReading(viewerId: string): ViewerReading[] {
	type Row = {
		roomId: string;
		fileId: string;
		title: string | null;
		fileVersionId: string;
		version: number | null;
		pageCount: number | null;
		current: number;
		timeMs: number;
		lastAt: number;
	};
	const meta = `r.room_id AS roomId, r.file_id AS fileId, f.title, r.file_version_id AS fileVersionId,
		v.version, v.pages AS pageCount, coalesce(v.version = f.current_version, 0) AS current`;
	const pages = sqlite()
		.prepare(`SELECT ${meta}, r.page, sum(r.duration_ms) AS timeMs, max(r.last_at) AS lastAt
		FROM page_reads r LEFT JOIN files f ON f.id = r.file_id LEFT JOIN file_versions v ON v.id = r.file_version_id
		WHERE r.viewer_id = ? GROUP BY r.room_id, r.file_id, r.file_version_id, r.page ORDER BY r.page`)
		.all(viewerId) as (Row & { page: number })[];
	const videos = sqlite()
		.prepare(`SELECT ${meta}, r.watched_ms AS timeMs, r.last_at AS lastAt,
		r.duration_ms AS durationMs, r.watched_ranges_json AS ranges
		FROM video_reads r LEFT JOIN files f ON f.id = r.file_id LEFT JOIN file_versions v ON v.id = r.file_version_id
		WHERE r.viewer_id = ?`)
		.all(viewerId) as (Row & { durationMs: number | null; ranges: string })[];
	const files = new Map<string, ViewerReading>();
	const ensure = (row: Row) => {
		let file = files.get(row.fileId);
		if (!file) {
			file = {
				roomId: row.roomId,
				fileId: row.fileId,
				title: row.title,
				pages: 0,
				timeMs: 0,
				lastAt: 0,
				versions: [],
			};
			files.set(row.fileId, file);
		}
		let version = file.versions.find((value) => value.fileVersionId === row.fileVersionId);
		if (!version) {
			version = {
				fileVersionId: row.fileVersionId,
				version: row.version,
				pageCount: row.pageCount,
				current: !!row.current,
				timeMs: 0,
				lastAt: 0,
				perPage: [],
				video: null,
			};
			file.versions.push(version);
		}
		file.timeMs += row.timeMs;
		file.lastAt = Math.max(file.lastAt, row.lastAt);
		version.timeMs += row.timeMs;
		version.lastAt = Math.max(version.lastAt, row.lastAt);
		return version;
	};
	for (const row of pages)
		ensure(row).perPage.push({ page: row.page, timeMs: row.timeMs, lastAt: row.lastAt });
	for (const row of videos) {
		const version = ensure(row);
		version.video ??= { durationMs: null, ranges: [] };
		if (row.durationMs !== null)
			version.video.durationMs = Math.max(version.video.durationMs ?? 0, row.durationMs);
		version.video.ranges.push(...(JSON.parse(row.ranges) as [number, number][]));
	}
	for (const file of files.values()) {
		file.pages = new Set(file.versions.flatMap((version) => version.perPage.map((page) => page.page))).size;
		file.versions.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
		for (const version of file.versions) {
			if (!version.video) continue;
			const ranges: [number, number][] = [];
			for (const [start, end] of version.video.ranges.sort((a, b) => a[0] - b[0])) {
				const last = ranges.at(-1);
				if (last && start <= last[1]) last[1] = Math.max(last[1], end);
				else ranges.push([start, end]);
			}
			version.video.ranges = ranges;
		}
	}
	return [...files.values()].sort((a, b) => b.lastAt - a.lastAt);
}
