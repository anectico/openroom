import { z } from 'zod';

export const personalWelcome = z
	.string()
	.trim()
	.max(4000)
	.nullable()
	.transform((value) => value || null)
	.describe(
		'Markdown welcome for everyone using this link, visible only after access checks. Null or blank uses the room introduction.',
	);

export const pinnedDocuments = z.object({
	roomId: z.string(),
	fileIds: z
		.array(z.string())
		.max(6)
		.refine((ids) => new Set(ids).size === ids.length, 'Each document can be pinned only once.')
		.describe(
			'Up to six file IDs from this room, in reading order. Replaces the whole list; [] clears it. Access rules still apply.',
		),
});
