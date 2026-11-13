import { z } from 'zod';
import { database } from '../server/db/index.ts';
import { eraseViewer as erase } from '../server/erasure.ts';
import { confirmField, defineOperation, notFound, ok } from './define.ts';

export const eraseViewer = defineOperation({
	name: 'erase_viewer',
	summary:
		'Erase an investor’s personal data, visits, private questions and uploads across every room. NDA evidence and email blocks remain. Backups age out separately. Ask your person before confirming.',
	role: 'admin',
	http: { method: 'DELETE', path: '/viewers/{viewerId}' },
	input: z.object({ viewerId: z.string(), ...confirmField }),
	output: ok,
	destructive: (input) => {
		const viewer = database()
			.sqlite.prepare('SELECT 1 FROM viewers WHERE id = ? AND erased_at IS NULL')
			.get(input.viewerId);
		if (!viewer) throw notFound('Investor');
		return 'This permanently erases the investor’s email, name, visits, answers, private conversations and file-request uploads across every room, ends all their sessions, removes their email from allow lists, invalidates their data exports and rebuilds affected freeze archives. NDA acceptances and email blocks remain. Backups and released file bytes are retained separately from this operation.';
	},
	audit: { target: (input) => ({ type: 'viewer', id: input.viewerId }) },
	run: (input, ctx) => {
		if (!erase(input.viewerId, ctx.actor.userId)) throw notFound('Investor');
		return { ok: true as const };
	},
});
