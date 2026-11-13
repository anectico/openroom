import { database } from './db/index.ts';

export type AuditEntry = {
	userId?: string | null;
	apiKeyId?: string | null;
	roomId?: string | null;
	operation: string;
	targetType?: string | null;
	targetId?: string | null;
	detail?: Record<string, unknown> | null;
};

export function writeAudit(entry: AuditEntry) {
	database()
		.sqlite.prepare(
			'INSERT INTO audit_log (user_id, api_key_id, room_id, operation, target_type, target_id, detail_json, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		)
		.run(
			entry.userId ?? null,
			entry.apiKeyId ?? null,
			entry.roomId ?? null,
			entry.operation,
			entry.targetType ?? null,
			entry.targetId ?? null,
			entry.detail && Object.keys(entry.detail).length ? JSON.stringify(entry.detail) : null,
			Date.now(),
		);
}
