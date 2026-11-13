import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Req = {
	id: string;
	target: { kind: string; id: string; label: string };
	title: string;
	description: string;
	maxSize: number;
	dueAt: number | null;
	overdue: boolean;
	closedAt: number | null;
	uploads: {
		id: string;
		viewerId: string | null;
		email: string | null;
		verified: boolean;
		name: string;
		size: number;
		late: boolean;
		uploadedAt: number;
		downloadUrl: string;
	}[];
};

export const load: PageServerLoad = async ({ locals, params }) => {
	const requests = (await runOp<{ requests: Req[] }>(locals, 'list_file_requests', { roomId: params.roomId }))
		.requests;
	const canEdit = locals.member?.role !== 'observer';
	const investors = (
		await runOp<{ investors: { viewerId: string; email: string | null; verified: boolean }[] }>(
			locals,
			'get_room_activity',
			{ roomId: params.roomId },
		)
	).investors.filter((i) => i.verified && i.email);
	const links = canEdit
		? (
				await runOp<{ links: { id: string; label: string }[] }>(locals, 'list_links', {
					roomId: params.roomId,
				})
			).links
		: [];
	const groups = (
		await runOp<{ groups: { id: string; name: string }[] }>(locals, 'list_groups', { roomId: params.roomId })
	).groups;
	return { requests, investors, links, groups };
};
