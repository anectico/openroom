import { z } from 'zod';
import { database } from '../server/db/index.ts';
import { defineOperation } from './define.ts';

const entry = z.object({
	id: z.number(),
	at: z.number(),
	operation: z.string(),
	memberId: z.string().nullable(),
	memberName: z.string().nullable(),
	apiKeyId: z.string().nullable(),
	roomId: z.string().nullable(),
	targetType: z.string().nullable(),
	targetId: z.string().nullable(),
	detail: z.record(z.string(), z.unknown()).nullable(),
});

export const listAuditLog = defineOperation({
	name: 'list_audit_log',
	summary: 'List audit log entries, newest first. Page with before (the last id you saw).',
	role: 'observer',
	http: { method: 'GET', path: '/audit-log' },
	input: z.object({
		roomId: z.string().optional(),
		memberId: z.string().optional(),
		operation: z.string().max(80).optional(),
		since: z.coerce.number().int().optional().describe('Only entries at or after this time (ms).'),
		before: z.coerce.number().int().optional(),
		limit: z.coerce.number().int().min(1).max(500).default(100),
	}),
	output: z.object({ entries: z.array(entry), nextBefore: z.number().nullable() }),
	audit: false,
	run: (input) => {
		const rows = database()
			.sqlite.prepare(
				`SELECT a.id, a.at, a.operation, a.user_id AS memberId, u.name AS memberName, a.api_key_id AS apiKeyId,
					a.room_id AS roomId, a.target_type AS targetType, a.target_id AS targetId, a.detail_json AS detail
				FROM audit_log a LEFT JOIN user u ON u.id = a.user_id
				WHERE (? IS NULL OR a.room_id = ?) AND (? IS NULL OR a.user_id = ?) AND (? IS NULL OR a.id < ?)
					AND (? IS NULL OR a.operation = ?) AND (? IS NULL OR a.at >= ?)
				ORDER BY a.id DESC LIMIT ?`,
			)
			.all(
				input.roomId ?? null,
				input.roomId ?? null,
				input.memberId ?? null,
				input.memberId ?? null,
				input.before ?? null,
				input.before ?? null,
				input.operation ?? null,
				input.operation ?? null,
				input.since ?? null,
				input.since ?? null,
				input.limit,
			) as (Omit<z.input<typeof entry>, 'detail'> & { detail: string | null })[];
		const entries = rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
		return {
			entries,
			nextBefore: entries.length === input.limit ? (entries.at(-1)?.id ?? null) : null,
		};
	},
});
