import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Conversation = {
	id: string;
	email: string | null;
	verified: boolean;
	fileTitle: string | null;
	page: number | null;
	answered: boolean;
	lastMessage: string;
	lastMessageAt: number;
	messageCount: number;
};
type Faq = { id: string; question: string; answerMarkdown: string; position: number };

export const load: PageServerLoad = async ({ locals, params }) => ({
	conversations: (
		await runOp<{ conversations: Conversation[] }>(locals, 'list_conversations', { roomId: params.roomId })
	).conversations,
	faq: (await runOp<{ entries: Faq[] }>(locals, 'list_faq', { roomId: params.roomId })).entries,
});
