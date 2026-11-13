import { z } from 'zod';
import { database } from '../server/db/index.ts';
import { newId } from '../server/ids.ts';
import { defineOperation } from './define.ts';
import { loadRoom, writableRoom } from './rooms.ts';

const version = z.object({
	id: z.string(),
	bodyMarkdown: z.string(),
	createdAt: z.number(),
	current: z.boolean(),
	acceptances: z.number(),
});

function versions(roomId: string, currentId: string | null) {
	const rows = database()
		.sqlite.prepare(
			`SELECT v.id, v.body_markdown AS bodyMarkdown, v.created_at AS createdAt,
				(SELECT count(*) FROM nda_acceptances a WHERE a.nda_version_id = v.id) AS acceptances
			FROM nda_versions v WHERE v.room_id = ? ORDER BY v.created_at DESC`,
		)
		.all(roomId) as Omit<z.input<typeof version>, 'current'>[];
	return rows.map((r) => ({ ...r, current: r.id === currentId }));
}

export const getNda = defineOperation({
	name: 'get_nda',
	summary:
		'Show a room’s NDA: the current text and every earlier version with how many investors accepted it.',
	role: 'observer',
	http: { method: 'GET', path: '/rooms/{roomId}/nda' },
	input: z.object({ roomId: z.string() }),
	output: z.object({ roomId: z.string(), versions: z.array(version) }),
	audit: false,
	run: (input) => {
		const room = loadRoom(input.roomId);
		return { roomId: room.id, versions: versions(room.id, room.current_nda_version_id) };
	},
});

export const publishNda = defineOperation({
	name: 'publish_nda',
	summary:
		'Publish a new NDA version (Markdown) for a room. Links that require an NDA ask every investor to accept the new version.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms/{roomId}/nda' },
	input: z.object({ roomId: z.string(), bodyMarkdown: z.string().trim().min(20).max(100_000) }),
	output: z.object({ roomId: z.string(), versions: z.array(version) }),
	audit: { target: (i) => ({ type: 'room', id: i.roomId, roomId: i.roomId }) },
	run: (input, ctx) => {
		const room = writableRoom(input.roomId);
		const id = newId('ndav');
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				sqlite
					.prepare(
						'INSERT INTO nda_versions (id, room_id, body_markdown, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
					)
					.run(id, room.id, input.bodyMarkdown, ctx.actor.userId, Date.now());
				sqlite.prepare('UPDATE rooms SET current_nda_version_id = ? WHERE id = ?').run(id, room.id);
			})
			.immediate();
		return { roomId: room.id, versions: versions(room.id, id) };
	},
});
