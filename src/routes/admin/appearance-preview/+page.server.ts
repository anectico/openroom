import type { Room, TreeNode } from '#lib/admin/types.ts';
import { runOp } from '#lib/server/http/admin.ts';
import { renderMarkdown } from '#lib/server/markdown.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const roomId = url.searchParams.get('room');
	if (roomId) {
		const [room, faq] = await Promise.all([
			runOp<Room>(locals, 'get_room', { roomId }),
			runOp<{ entries: { id: string; question: string; answerMarkdown: string }[] }>(locals, 'list_faq', {
				roomId,
			}),
		]);
		return {
			tree: room.tree,
			pins: room.pinnedFileIds,
			faq: faq.entries.map(({ id, question, answerMarkdown }) => ({
				id,
				question,
				answerHtml: renderMarkdown(answerMarkdown),
			})),
			downloads: room.linkDefaults.downloads,
			verified: room.linkDefaults.verifyEmail,
		};
	}
	const tree: TreeNode[] = ['Company overview', 'Financial highlights', 'Product roadmap'].map(
		(name, index) => ({
			type: 'file',
			id: String(index + 1),
			parentId: null,
			number: String(index + 1),
			depth: 0,
			name,
			kind: 'pdf',
			version: 1,
			size: 2457600,
			contentType: 'application/pdf',
		}),
	);
	return { tree, pins: tree.map((file) => file.id), faq: [], downloads: 'none' as const, verified: false };
};
