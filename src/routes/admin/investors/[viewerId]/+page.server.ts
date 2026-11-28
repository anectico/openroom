import type { ViewerReading } from '#lib/server/activity-views.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Viewer = {
	id: string;
	email: string | null;
	firm: string | null;
	firstSeenAt: number;
	sessions: {
		id: string;
		roomId: string;
		roomName: string;
		linkLabel: string;
		verified: boolean;
		fields: Record<string, string> | null;
		createdAt: number;
		lastSeenAt: number;
	}[];
	ndaAcceptances: { roomId: string; name: string; verified: boolean; acceptedAt: number }[];
	reads: ViewerReading[];
	downloads: number;
	questions: {
		id: string;
		roomId: string;
		fileTitle: string | null;
		page: number | null;
		firstMessage: string;
		messages: number;
		lastMessageAt: number;
	}[];
	uploads: {
		id: string;
		roomId: string;
		requestTitle: string;
		name: string;
		size: number;
		late: boolean;
		uploadedAt: number;
	}[];
};

type Access = {
	viewerId: string;
	email: string | null;
	blocked: boolean;
	blocks: { id: string; kind: 'email' | 'domain'; value: string }[];
	links: {
		linkId: string;
		roomId: string;
		roomName: string;
		linkLabel: string;
		status: 'active' | 'expired' | 'revoked';
		via: 'email' | 'domain' | 'open' | 'none';
		blockedOnLink: boolean;
		canEnter: boolean;
		groupName: string | null;
		lastVisitAt: number | null;
	}[];
};

export const load: PageServerLoad = async ({ locals, params }) => ({
	viewer: await runOp<Viewer>(locals, 'get_viewer', { viewerId: params.viewerId }),
	access: await runOp<Access>(locals, 'get_viewer_access', { viewerId: params.viewerId }),
});
