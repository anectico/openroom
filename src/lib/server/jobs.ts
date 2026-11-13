import { database } from './db/index.ts';

export type JobContext = { id: number; attempt: number };
type Handler = (payload: unknown, ctx: JobContext) => Promise<void> | void;
type Schedule = { kind: string; everyMs: number };

const handlers = new Map<string, Handler>();
const laneKinds = {
	heavy: [
		'export.zip',
		'export.archive',
		'files.pages',
		'storage.to_s3',
		'storage.transfer',
		'objects.cleanup',
		'objects.sweep',
	],
	outbound: ['webhook.deliver'],
};
const special = [...laneKinds.heavy, ...laneKinds.outbound];
type Lane = 'light' | keyof typeof laneKinds;
const schedules: Schedule[] = [];

export function defineJob(kind: string, handler: Handler, schedule?: { everyMs: number }) {
	handlers.set(kind, handler);
	if (schedule) schedules.push({ kind, everyMs: schedule.everyMs });
}

export function enqueue(
	kind: string,
	payload: unknown = {},
	options: { runAt?: number; maxAttempts?: number } = {},
) {
	const now = Date.now();
	database()
		.sqlite.prepare(
			'INSERT INTO jobs (kind, payload, run_at, max_attempts, created_at) VALUES (?, ?, ?, ?, ?)',
		)
		.run(kind, JSON.stringify(payload), options.runAt ?? now, options.maxAttempts ?? 8, now);
}

function ensureSchedules() {
	const now = Date.now();
	const insert = database().sqlite.prepare(
		'INSERT INTO jobs (kind, payload, schedule_key, run_at, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (schedule_key) DO NOTHING',
	);
	for (const s of schedules) insert.run(s.kind, '{}', s.kind, now, now);
}

type Row = {
	id: number;
	kind: string;
	payload: string;
	schedule_key: string | null;
	attempts: number;
	max_attempts: number;
};

function claim(lane: Lane): Row | undefined {
	const now = Date.now();
	const kinds = lane === 'light' ? special : laneKinds[lane];
	const marks = kinds.map(() => '?').join(',');
	return database()
		.sqlite.prepare(
			`UPDATE jobs SET locked_at = ?, attempts = attempts + 1
			WHERE id = (SELECT id FROM jobs WHERE done_at IS NULL AND failed_at IS NULL AND locked_at IS NULL AND run_at <= ?
				AND (kind IN (${marks})) = ? ORDER BY run_at LIMIT 1)
			RETURNING id, kind, payload, schedule_key, attempts, max_attempts`,
		)
		.get(now, now, ...kinds, lane === 'light' ? 0 : 1) as Row | undefined;
}

function backoff(attempt: number) {
	return Math.min(60 * 60_000, 2 ** attempt * 5_000);
}

function finish(row: Row, error: unknown) {
	const { sqlite } = database();
	const now = Date.now();
	const schedule = row.schedule_key ? schedules.find((s) => s.kind === row.schedule_key) : undefined;
	if (schedule) {
		sqlite
			.prepare(
				'UPDATE jobs SET locked_at = NULL, attempts = 0, run_at = ?, last_error = ? WHERE id = ? AND done_at IS NULL',
			)
			.run(now + schedule.everyMs, error ? String(error) : null, row.id);
	} else if (!error) {
		sqlite
			.prepare(
				"UPDATE jobs SET locked_at = NULL, done_at = ?, last_error = NULL, payload = '{}' WHERE id = ? AND done_at IS NULL",
			)
			.run(now, row.id);
	} else if (row.attempts >= row.max_attempts) {
		sqlite
			.prepare(
				"UPDATE jobs SET locked_at = NULL, failed_at = ?, last_error = ?, payload = '{}' WHERE id = ? AND done_at IS NULL",
			)
			.run(now, String(error), row.id);
	} else {
		sqlite
			.prepare(
				'UPDATE jobs SET locked_at = NULL, run_at = ?, last_error = ? WHERE id = ? AND done_at IS NULL',
			)
			.run(now + backoff(row.attempts), String(error), row.id);
	}
}

let running = false;
const lanes = [
	...(['light', 'heavy', 'outbound'] as const).map((kind) => ({
		kind,
		current: null as Promise<void> | null,
		timer: null as NodeJS.Timeout | null,
	})),
];

async function tick(lane: (typeof lanes)[number]) {
	lane.timer = null;
	if (!running) return;
	let row = claim(lane.kind);
	while (row && running) {
		const job = row;
		const handler = handlers.get(job.kind);
		let error: unknown = null;
		try {
			if (!handler) throw new Error(`No handler for job ${job.kind}`);
			await handler(JSON.parse(job.payload), { id: job.id, attempt: job.attempts });
		} catch (e) {
			error = e instanceof Error ? e.message : e;
			error = String(error).replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, '<address>');
			console.error(`job ${job.kind} #${job.id} failed: ${error}`);
		}
		finish(job, error);
		row = running ? claim(lane.kind) : undefined;
	}
	if (running) lane.timer = setTimeout(() => (lane.current = tick(lane)), 1000);
}

export function startJobs() {
	if (running) return;
	running = true;
	database()
		.sqlite.prepare('UPDATE jobs SET locked_at = NULL WHERE locked_at IS NOT NULL AND done_at IS NULL')
		.run();
	ensureSchedules();
	for (const lane of lanes) lane.current = tick(lane);
}

export async function stopJobs() {
	running = false;
	for (const lane of lanes) if (lane.timer) clearTimeout(lane.timer);
	await Promise.all(lanes.map((lane) => lane.current));
}
