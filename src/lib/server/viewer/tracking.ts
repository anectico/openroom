import { notify, recordEvent } from '../activity.ts';
import { database } from '../db/index.ts';
import type { ViewerContext } from './access.ts';
import { currentVersionId } from './serve.ts';

const sqlite = () => database().sqlite;
const maxBeaconMs = 10 * 60_000;
const slackMs = 5_000;
const repeatWindowMs = 10 * 60_000;

export type Beacon = {
	fileId: string;
	pages?: Record<string, number>;
	video?: { ranges?: [number, number][]; durationMs?: number };
};

function isBeacon(value: unknown): value is Beacon {
	if (!value || typeof value !== 'object') return false;
	const b = value as Record<string, unknown>;
	if (typeof b.fileId !== 'string' || b.fileId.length > 64) return false;
	if (b.pages !== undefined && (typeof b.pages !== 'object' || b.pages === null || Array.isArray(b.pages)))
		return false;
	if (b.video !== undefined) {
		if (typeof b.video !== 'object' || b.video === null) return false;
		const v = b.video as Record<string, unknown>;
		if (
			v.ranges !== undefined &&
			(!Array.isArray(v.ranges) || !v.ranges.every((r) => Array.isArray(r) && r.length === 2))
		)
			return false;
	}
	return true;
}

function mergeRanges(ranges: [number, number][]) {
	const sorted = ranges
		.map(([a, b]) => [Number(a), Number(b)] as [number, number])
		.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a && a >= 0)
		.map(([a, b]) => [Math.round(a), Math.round(b)] as [number, number])
		.sort((x, y) => x[0] - y[0]);
	const out: [number, number][] = [];
	for (const r of sorted) {
		const last = out.at(-1);
		if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
		else out.push([...r]);
	}
	return out.slice(0, 500);
}

function trimRanges(ranges: [number, number][], budget: number) {
	const out: [number, number][] = [];
	for (const [start, end] of ranges) {
		const length = Math.min(end - start, budget);
		if (length > 0) out.push([start, start + length]);
		budget -= length;
		if (budget <= 0) break;
	}
	return out;
}

function newRanges(ranges: [number, number][], previous: [number, number][]) {
	const out: [number, number][] = [];
	for (const [start, end] of ranges) {
		let cursor = start;
		for (const [a, b] of previous) {
			if (b <= cursor) continue;
			if (a >= end) break;
			if (a > cursor) out.push([cursor, a]);
			cursor = Math.max(cursor, b);
			if (cursor >= end) break;
		}
		if (cursor < end) out.push([cursor, end]);
	}
	return out;
}

function takeBudget(sessionId: string, wanted: number, now: number) {
	const s = sqlite()
		.prepare('SELECT created_at, credited_ms FROM viewer_sessions WHERE id = ?')
		.get(sessionId) as {
		created_at: number;
		credited_ms: number;
	};
	const available = Math.max(0, now - s.created_at + slackMs - s.credited_ms);
	const granted = Math.min(wanted, available, maxBeaconMs);
	sqlite()
		.prepare(
			'UPDATE viewer_sessions SET credited_ms = credited_ms + ?, last_beacon_at = ?, last_seen_at = ? WHERE id = ?',
		)
		.run(granted, now, now, sessionId);
	return granted;
}

export function recordBeacon(ctx: ViewerContext, raw: unknown, visible: (fileId: string) => boolean) {
	if (ctx.preview || !ctx.session.viewer_id || !isBeacon(raw)) return;
	const beacon = raw;
	if (!visible(beacon.fileId)) return;
	const version = currentVersionId(beacon.fileId);
	if (!version) return;
	const now = Date.now();
	const viewerId = ctx.session.viewer_id;
	const roomId = ctx.room.id;
	const pageLimit = version.kind === 'pdf' ? (version.pages ?? 10_000) : version.kind === 'image' ? 1 : 0;
	const pages = Object.entries(beacon.pages ?? {})
		.map(([p, ms]) => [Math.trunc(Number(p)), Math.max(0, Math.trunc(Number(ms)))] as const)
		.filter(([p, ms]) => p >= 1 && p <= pageLimit && ms > 0 && Number.isFinite(ms))
		.map(([p, ms]) => [p, Math.min(ms, maxBeaconMs)] as const)
		.slice(0, 50);
	const pageTotal = pages.reduce((s, [, ms]) => s + ms, 0);
	const ranges =
		version.kind === 'video' && beacon.video?.ranges ? mergeRanges(beacon.video.ranges.slice(0, 200)) : [];
	if (!pages.length && !ranges.length) return;
	const existing = ranges.length
		? (sqlite()
				.prepare(
					'SELECT watched_ranges_json, watched_ms, duration_ms FROM video_reads WHERE session_id = ? AND file_version_id = ?',
				)
				.get(ctx.session.id, version.id) as
				| { watched_ranges_json: string; watched_ms: number; duration_ms: number | null }
				| undefined)
		: undefined;
	const previous = existing
		? trimRanges(mergeRanges(JSON.parse(existing.watched_ranges_json)), existing.watched_ms)
		: [];
	const added = newRanges(ranges, previous);
	const videoWanted = added.reduce((s, [a, b]) => s + (b - a), 0);
	const granted = takeBudget(ctx.session.id, pageTotal + videoWanted, now);
	if (pages.length && pageTotal > 0) {
		const pageShare = Math.min(pageTotal, granted);
		const factor = pageShare / pageTotal;
		let remaining = pageShare;
		const upsert = sqlite().prepare(
			`INSERT INTO page_reads (session_id, viewer_id, room_id, file_id, file_version_id, page, duration_ms, first_at, last_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (session_id, file_version_id, page) DO UPDATE SET duration_ms = duration_ms + excluded.duration_ms, last_at = excluded.last_at`,
		);
		sqlite()
			.transaction(() => {
				for (const [page, ms] of pages) {
					const credited = Math.min(remaining, Math.round(ms * factor));
					remaining -= credited;
					upsert.run(ctx.session.id, viewerId, roomId, beacon.fileId, version.id, page, credited, now, now);
				}
			})
			.immediate();
		if (version.pages) checkReadPast(ctx, beacon.fileId, version.id, version.pages);
	}
	if (ranges.length) {
		const videoShare = Math.max(0, granted - Math.min(pageTotal, granted));
		const merged = mergeRanges([...previous, ...trimRanges(added, videoShare)]);
		const watched = merged.reduce((sum, [a, b]) => sum + b - a, 0);
		const reported = Math.trunc(Number(beacon.video?.durationMs));
		const lastEnd = merged.at(-1)?.[1] ?? 0;
		const duration =
			existing?.duration_ms ??
			(reported >= lastEnd && reported > 0 && reported < 86_400_000 ? reported : null);
		sqlite()
			.prepare(
				`INSERT INTO video_reads (session_id, viewer_id, room_id, file_id, file_version_id, watched_ranges_json, watched_ms, duration_ms, last_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (session_id, file_version_id) DO UPDATE SET watched_ranges_json = excluded.watched_ranges_json,
					watched_ms = excluded.watched_ms, duration_ms = coalesce(video_reads.duration_ms, excluded.duration_ms), last_at = excluded.last_at`,
			)
			.run(
				ctx.session.id,
				viewerId,
				roomId,
				beacon.fileId,
				version.id,
				JSON.stringify(merged),
				watched,
				duration,
				now,
			);
		if (duration && watched / duration >= ctx.settings.readPastShare)
			markReadPast(ctx, beacon.fileId, version.id);
	}
}

function checkReadPast(ctx: ViewerContext, fileId: string, versionId: string, pages: number) {
	const read = (
		sqlite()
			.prepare(
				'SELECT count(*) AS n FROM (SELECT page FROM page_reads WHERE viewer_id = ? AND file_version_id = ? GROUP BY page HAVING sum(duration_ms) >= 1000)',
			)
			.get(ctx.session.viewer_id, versionId) as { n: number }
	).n;
	if (read / pages >= ctx.settings.readPastShare) markReadPast(ctx, fileId, versionId);
}

function markReadPast(ctx: ViewerContext, fileId: string, versionId: string) {
	const done = sqlite()
		.prepare("SELECT 1 FROM events WHERE kind = 'read_past' AND viewer_id = ? AND file_version_id = ?")
		.get(ctx.session.viewer_id, versionId);
	if (done) return;
	const base = { roomId: ctx.room.id, linkId: ctx.link.id, viewerId: ctx.session.viewer_id, fileId };
	recordEvent({ ...base, kind: 'read_past', sessionId: ctx.session.id, fileVersionId: versionId });
	notify('read_past', base);
}

export function trackOnce(ctx: ViewerContext, kind: 'file_open', fileId: string) {
	if (ctx.preview || !ctx.session.viewer_id) return;
	const seen = sqlite()
		.prepare('SELECT 1 FROM events WHERE session_id = ? AND kind = ? AND file_id = ?')
		.get(ctx.session.id, kind, fileId);
	if (seen) return;
	const version = currentVersionId(fileId);
	recordEvent({
		kind,
		roomId: ctx.room.id,
		linkId: ctx.link.id,
		viewerId: ctx.session.viewer_id,
		sessionId: ctx.session.id,
		fileId,
		fileVersionId: version?.id ?? null,
	});
}

export function trackDownload(
	ctx: ViewerContext,
	fileId: string | null,
	zip: boolean,
	_range: string | null,
) {
	if (ctx.preview || !ctx.session.viewer_id) return;
	const kind = zip ? 'zip_download' : 'download';
	const recent = sqlite()
		.prepare('SELECT 1 FROM events WHERE session_id = ? AND kind = ? AND file_id IS ? AND at > ?')
		.get(ctx.session.id, kind, fileId, Date.now() - repeatWindowMs);
	if (recent) return;
	const base = { roomId: ctx.room.id, linkId: ctx.link.id, viewerId: ctx.session.viewer_id, fileId };
	recordEvent({
		...base,
		kind,
		sessionId: ctx.session.id,
		fileVersionId: fileId ? (currentVersionId(fileId)?.id ?? null) : null,
	});
	notify('download', { ...base, detail: zip ? { zip: true } : null });
}
