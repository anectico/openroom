import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Key = {
	id: string;
	name: string | null;
	start: string | null;
	memberId: string;
	memberEmail: string;
	createdAt: number;
	lastUsedAt: number | null;
};

export const load: PageServerLoad = async ({ locals }) => ({
	keys: (await runOp<{ keys: Key[] }>(locals, 'list_api_keys', { all: locals.member?.role === 'owner' }))
		.keys,
});
