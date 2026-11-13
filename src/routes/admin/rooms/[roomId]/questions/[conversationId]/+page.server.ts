import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Thread = {
	id: string;
	email: string | null;
	verified: boolean;
	viewerId: string | null;
	fileId: string | null;
	fileTitle: string | null;
	page: number | null;
	answered: boolean;
	messages: {
		id: string;
		from: 'investor' | 'member';
		memberName: string | null;
		body: string;
		createdAt: number;
	}[];
};

export const load: PageServerLoad = async ({ locals, params }) => ({
	thread: await runOp<Thread>(locals, 'get_conversation', { conversationId: params.conversationId }),
});
