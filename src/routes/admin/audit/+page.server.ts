import { type AuditEntry as Entry, auditFilters as filters } from '#lib/admin/audit.ts';
import { operations as registry } from '#lib/operations/index.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

const outsideRegistry = [
	'accept_invite',
	'seed_owner',
	'reset_password',
	'change_password',
	'server.create_api_key',
	'server.reset_password',
	'server.key_rotation',
];
const operations = [
	...new Set([...registry.filter((op) => op.audit !== false).map((op) => op.name), ...outsideRegistry]),
].sort();

export const load: PageServerLoad = async ({ locals, url }) => {
	const before = url.searchParams.get('before');
	const result = await runOp<{ entries: Entry[]; nextBefore: number | null }>(locals, 'list_audit_log', {
		...filters(url),
		before: before ? Number(before) : undefined,
		limit: 100,
	});
	const members =
		locals.member?.role === 'owner'
			? (await runOp<{ members: { id: string; name: string; email: string }[] }>(locals, 'list_members'))
					.members
			: [];
	return { ...result, members, operations, paged: !!before, query: Object.fromEntries(url.searchParams) };
};
