import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Node = {
	type: 'folder' | 'file';
	id: string;
	parentId: string | null;
	number: string;
	depth: number;
	name: string;
	access: 'view' | 'none';
	inherited: boolean;
};

type Link = { id: string; label: string; status: string; groupId: string | null };

export const load: PageServerLoad = async ({ locals, params }) => {
	const group = await runOp<{
		id: string;
		name: string;
		defaultAccess: 'view' | 'none';
		linkCount: number;
		tree: Node[];
	}>(locals, 'get_group', { groupId: params.groupId });
	const { links } = await runOp<{ links: Link[] }>(locals, 'list_links', { roomId: params.roomId });
	return { group, links: links.filter((l) => l.groupId === group.id) };
};
