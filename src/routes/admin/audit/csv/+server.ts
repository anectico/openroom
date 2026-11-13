import { type AuditEntry as Entry, auditFilters as filters } from '#lib/admin/audit.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { RequestHandler } from './$types';

const cell = (value: unknown) => {
	let text = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const GET: RequestHandler = async ({ locals, url }) => {
	const rows = ['time,member,api_key,operation,room,target_type,target_id,detail'];
	let before: number | undefined;
	for (let page = 0; page < 200; page++) {
		const result = await runOp<{ entries: Entry[]; nextBefore: number | null }>(locals, 'list_audit_log', {
			...filters(url),
			before,
			limit: 500,
		});
		for (const e of result.entries)
			rows.push(
				[
					new Date(e.at).toISOString(),
					e.memberName ?? (e.memberId ? 'removed member' : 'server'),
					e.apiKeyId,
					e.operation,
					e.roomId,
					e.targetType,
					e.targetId,
					e.detail ? JSON.stringify(e.detail) : '',
				]
					.map(cell)
					.join(','),
			);
		if (!result.nextBefore) break;
		before = result.nextBefore;
	}
	return new Response(`${rows.join('\n')}\n`, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="openroom-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
		},
	});
};
