import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

export type Activity = {
	summary: string;
	investors: {
		viewerId: string;
		email: string | null;
		verified: boolean;
		firm: string | null;
		fields: Record<string, string> | null;
		visits: number;
		files: number;
		timeMs: number;
		downloads: number;
		lastSeenAt: number;
	}[];
	firms: {
		firm: string;
		viewers: number;
		visits: number;
		timeMs: number;
		downloads: number;
		lastSeenAt: number;
	}[];
	files: {
		fileId: string;
		number: string;
		title: string;
		kind: string | null;
		pages: number | null;
		viewers: number;
		totalMs: number;
		avgMs: number;
		versionsRead: number[];
		perPage: { page: number; ms: number; viewers: number }[];
		videoWatchedByTenth: number[] | null;
	}[];
	timeline: {
		id: number;
		kind: string;
		at: number;
		email: string | null;
		fileTitle: string | null;
		requestTitle: string | null;
		viewerId: string | null;
	}[];
	viewingNow: { sessionId: string; email: string | null; fileTitle: string | null; viewerId: string }[];
};

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const days = Number(url.searchParams.get('days') ?? '');
	const input = {
		roomId: params.roomId,
		linkId: url.searchParams.get('link') || undefined,
		groupId: url.searchParams.get('group') || undefined,
		from: days > 0 ? Date.now() - days * 86_400_000 : undefined,
	};
	const activity = await runOp<Activity>(locals, 'get_room_activity', input);
	const canSeeLinks = locals.member?.role !== 'observer';
	const links = canSeeLinks
		? (
				await runOp<{ links: { id: string; label: string }[] }>(locals, 'list_links', {
					roomId: params.roomId,
					includeInactive: true,
				})
			).links
		: [];
	const groups = (
		await runOp<{ groups: { id: string; name: string }[] }>(locals, 'list_groups', { roomId: params.roomId })
	).groups;
	return { activity, links, groups, query: Object.fromEntries(url.searchParams) };
};
