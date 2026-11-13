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

export const load: PageServerLoad = async ({ locals, params }) => ({
	viewer: await runOp<Viewer>(locals, 'get_viewer', { viewerId: params.viewerId }),
});
