import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Block = { id: string; kind: 'email' | 'domain'; value: string; createdAt: number };
type Viewer = {
	id: string;
	email: string | null;
	firm: string | null;
	rooms: string[];
	lastSeenAt: number | null;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const search = url.searchParams.get('q') ?? '';
	return {
		search,
		viewers: (await runOp<{ viewers: Viewer[] }>(locals, 'list_viewers', { search: search || undefined }))
			.viewers,
		blocks: (await runOp<{ blocks: Block[] }>(locals, 'list_blocks')).blocks,
	};
};
