import { z } from 'zod';

export const customField = z.object({
	label: z.string().trim().min(1).max(60),
	required: z.boolean().default(true),
});

export const linkSettings = z.object({
	verifyEmail: z.boolean().describe('Investors confirm their email with a code before entering.'),
	requireNda: z.boolean().describe('Investors accept the room’s current NDA before entering.'),
	watermark: z.boolean().describe('Pages show the investor’s email, the time and their IP.'),
	screenshotProtection: z
		.boolean()
		.describe('Best effort: blur when the window loses focus, block printing.'),
	downloads: z
		.enum(['none', 'per_file', 'zip'])
		.describe('none, each file on its own, or the allowed set as one zip.'),
	customFields: z
		.array(customField)
		.max(5)
		.describe('Questions asked before viewing, such as company or fund.'),
	notifyEveryView: z.boolean().describe('Notify members on every visit, not only the first.'),
	readPastShare: z
		.number()
		.min(0.1)
		.max(1)
		.describe('Share of a file’s pages after which it counts as read.'),
});

export type LinkSettings = z.infer<typeof linkSettings>;

export const defaultLinkSettings: LinkSettings = {
	verifyEmail: true,
	requireNda: false,
	watermark: true,
	screenshotProtection: false,
	downloads: 'none',
	customFields: [],
	notifyEveryView: false,
	readPastShare: 0.8,
};
