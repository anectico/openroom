import { z } from 'zod';
import { blockValue, parseEntries, parseEntry } from '../server/access.ts';
import { database } from '../server/db/index.ts';
import { newId } from '../server/ids.ts';
import { defineOperation, notFound, OpError } from './define.ts';

const block = z.object({
	id: z.string(),
	kind: z.enum(['email', 'domain']),
	value: z.string().describe('The email or domain; “Erased investor” once that investor was erased.'),
	createdAt: z.number(),
});

type Row = { id: string; kind: 'email' | 'domain'; display: string | null; created_at: number };

const present = (r: Row) => ({
	id: r.id,
	kind: r.kind,
	value: r.display ?? 'Erased investor',
	createdAt: r.created_at,
});

export const listBlocks = defineOperation({
	name: 'list_blocks',
	summary: 'List the install-wide block list: emails and domains that can never enter any room.',
	role: 'observer',
	http: { method: 'GET', path: '/blocks' },
	input: z.object({}),
	output: z.object({ blocks: z.array(block) }),
	audit: false,
	run: () => {
		const rows = database()
			.sqlite.prepare(
				'SELECT id, kind, display, created_at FROM blocks WHERE link_id IS NULL ORDER BY created_at DESC',
			)
			.all() as Row[];
		return { blocks: rows.map(present) };
	},
});

export const addBlocks = defineOperation({
	name: 'add_blocks',
	summary:
		'Block emails or domains from every room. A block always wins over an allow list; open sessions end at once.',
	role: 'admin',
	http: { method: 'POST', path: '/blocks' },
	input: z.object({ entries: z.array(z.string().max(320)).min(1).max(1000) }),
	output: z.object({ blocks: z.array(block) }),
	audit: {
		target: () => ({ type: 'block', id: null }),
		detail: (_i, o) => ({ blockIds: o.blocks.map((b) => b.id) }),
	},
	run: (input) => {
		const { entries, invalid } = parseEntries(input.entries);
		if (invalid.length)
			throw new OpError(400, 'invalid_entries', `These are not emails or domains: ${invalid.join(', ')}`, {
				invalid,
			});
		const sqlite = database().sqlite;
		const existing = sqlite.prepare('SELECT 1 FROM blocks WHERE link_id IS NULL AND kind = ? AND value = ?');
		const insert = sqlite.prepare(
			'INSERT INTO blocks (id, link_id, kind, value, display, created_at) VALUES (?, NULL, ?, ?, ?, ?)',
		);
		const added: Row[] = [];
		sqlite
			.transaction(() => {
				for (const e of entries) {
					const value = blockValue(e);
					if (existing.get(e.kind, value)) continue;
					const row = { id: newId('blk'), kind: e.kind, display: e.value, created_at: Date.now() };
					insert.run(row.id, e.kind, value, e.value, row.created_at);
					added.push(row);
				}
			})
			.immediate();
		return { blocks: added.map(present) };
	},
});

export const removeBlock = defineOperation({
	name: 'remove_block',
	summary:
		'Remove an install-wide block by its id, or by typing the email or domain (works for erased investors).',
	role: 'admin',
	http: { method: 'POST', path: '/blocks/remove' },
	input: z
		.object({ blockId: z.string().optional(), entry: z.string().max(320).optional() })
		.refine((v) => !!v.blockId !== !!v.entry, 'Give either blockId or entry.'),
	output: z.object({ removed: z.number() }),
	audit: {
		target: (i) => ({ type: 'block', id: i.blockId ?? null }),
		detail: (_i, o) => ({ removed: o.removed }),
	},
	run: (input) => {
		const sqlite = database().sqlite;
		let changes: number;
		if (input.blockId) {
			changes = sqlite
				.prepare('DELETE FROM blocks WHERE id = ? AND link_id IS NULL')
				.run(input.blockId).changes;
		} else {
			const e = parseEntry(input.entry ?? '');
			if (!e) throw new OpError(400, 'invalid_entry', `${input.entry} is not an email or domain.`);
			changes = sqlite
				.prepare('DELETE FROM blocks WHERE link_id IS NULL AND kind = ? AND value = ?')
				.run(e.kind, blockValue(e)).changes;
		}
		if (!changes) throw notFound('Block');
		return { removed: changes };
	},
});
