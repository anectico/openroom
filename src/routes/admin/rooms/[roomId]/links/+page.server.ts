import type { Link } from '#lib/admin/types.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const includeInactive = url.searchParams.get('all') === '1';
	const { links } = await runOp<{ links: Link[] }>(locals, 'list_links', {
		roomId: params.roomId,
		includeInactive,
	});
	const { groups } = await runOp<{ groups: { id: string; name: string }[] }>(locals, 'list_groups', {
		roomId: params.roomId,
	});
	return { links, groups, includeInactive };
};
