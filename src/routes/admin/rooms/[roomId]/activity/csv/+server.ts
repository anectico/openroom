import { error } from '@sveltejs/kit';
import { runOp } from '#lib/server/http/admin.ts';
import type { Activity } from '../+page.server.ts';
import type { RequestHandler } from './$types';

const cell = (value: unknown) => {
	let text = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = (rows: unknown[][]) => `${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : '');
const minutes = (ms: number) => Math.round(ms / 6000) / 10;

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const days = Number(url.searchParams.get('days') ?? '');
	const a = await runOp<Activity>(locals, 'get_room_activity', {
		roomId: params.roomId,
		linkId: url.searchParams.get('link') || undefined,
		groupId: url.searchParams.get('group') || undefined,
		from: days > 0 ? Date.now() - days * 86_400_000 : undefined,
		timelineLimit: 20_000,
	});
	const view = url.searchParams.get('view') ?? 'investors';
	let body: string;
	if (view === 'investors')
		body = csv([
			['email', 'verified', 'firm', 'answers', 'visits', 'files', 'minutes', 'downloads', 'last_seen'],
			...a.investors.map((i) => [
				i.email,
				i.verified,
				i.firm,
				i.fields
					? Object.entries(i.fields)
							.map(([k, v]) => `${k}: ${v}`)
							.join('; ')
					: '',
				i.visits,
				i.files,
				minutes(i.timeMs),
				i.downloads,
				iso(i.lastSeenAt),
			]),
		]);
	else if (view === 'firms')
		body = csv([
			['firm', 'viewers', 'visits', 'minutes', 'downloads', 'last_seen'],
			...a.firms.map((f) => [f.firm, f.viewers, f.visits, minutes(f.timeMs), f.downloads, iso(f.lastSeenAt)]),
		]);
	else if (view === 'files')
		body = csv([
			['number', 'title', 'kind', 'viewers', 'total_minutes', 'average_minutes', 'versions_read'],
			...a.files.map((f) => [
				f.number,
				f.title,
				f.kind,
				f.viewers,
				minutes(f.totalMs),
				minutes(f.avgMs),
				f.versionsRead.join(' '),
			]),
		]);
	else if (view === 'timeline')
		body = csv([
			['time', 'event', 'email', 'file', 'request'],
			...a.timeline.map((e) => [iso(e.at), e.kind, e.email, e.fileTitle, e.requestTitle]),
		]);
	else error(400, 'Unknown view');
	return new Response(body, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="activity-${view}-${new Date().toISOString().slice(0, 10)}.csv"`,
		},
	});
};
