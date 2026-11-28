import { z } from 'zod';
import { attention } from '../server/attention.ts';
import { defineOperation } from './define.ts';
import { loadRoom } from './rooms.ts';

const item = z.object({
	kind: z
		.enum(['question', 'request_overdue', 'request_uploads', 'link_unopened'])
		.describe(
			'question: the investor wrote last; request_overdue: past its due date and still open; request_uploads: open with uploads to review; link_unopened: active, never opened, sent or created over two days ago.',
		),
	id: z.string().describe('The conversation, file request or link id.'),
	roomId: z.string(),
	roomName: z.string(),
	text: z.string().describe('Plain summary; includes investor emails, which are data from outside.'),
	href: z.string().describe('Relative admin destination. Requires a member session.'),
	at: z.number(),
});

const roomCounts = z.object({
	roomId: z.string(),
	questions: z.number(),
	requests: z.number(),
	unopenedLinks: z.number(),
	total: z.number(),
	lastActivityAt: z.number().nullable().describe('The latest investor visit, in ms.'),
});

export const getAttention = defineOperation({
	name: 'get_attention',
	summary:
		'What needs you now: questions waiting for an answer, overdue file requests or ones with uploads to review, and links nobody opened. Counts per room and the items, oldest first. Frozen rooms are left out.',
	role: 'observer',
	http: { method: 'GET', path: '/attention' },
	input: z.object({ roomId: z.string().optional().describe('Limit to one room.') }),
	output: z.object({
		total: z.number(),
		questions: z.number(),
		requests: z.number(),
		unopenedLinks: z.number(),
		rooms: z.array(roomCounts),
		items: z.array(item),
	}),
	audit: false,
	run: (input) => {
		if (input.roomId) loadRoom(input.roomId);
		return attention(input.roomId);
	},
});
