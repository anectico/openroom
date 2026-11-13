import { pinnedDocuments } from '../schemas/personalization.ts';
import { database } from '../server/db/index.ts';
import { pinnedFileIds } from '../server/pins.ts';
import { defineOperation, OpError } from './define.ts';
import { writableRoom } from './rooms.ts';

export const setPinnedDocuments = defineOperation({
	name: 'set_pinned_documents',
	summary:
		'Choose up to six Start here documents in reading order. Replaces the room list; [] clears it. Investors see only documents their link can access. Pinning never grants access.',
	role: 'admin',
	http: { method: 'PUT', path: '/rooms/{roomId}/pins' },
	input: pinnedDocuments,
	output: pinnedDocuments,
	audit: {
		target: (input) => ({ type: 'room', id: input.roomId, roomId: input.roomId }),
		detail: (input) => ({ fileIds: input.fileIds }),
	},
	run: (input) => {
		writableRoom(input.roomId);
		const db = database().sqlite;
		const find = db.prepare('SELECT 1 FROM files WHERE id = ? AND room_id = ?');
		if (input.fileIds.some((id) => !find.get(id, input.roomId)))
			throw new OpError(
				400,
				'invalid_pin',
				'A selected document no longer exists in this room. Refresh the list and try again.',
			);
		db.prepare('DELETE FROM room_pins WHERE room_id = ?').run(input.roomId);
		const insert = db.prepare('INSERT INTO room_pins (room_id, file_id, position) VALUES (?, ?, ?)');
		for (const [position, id] of input.fileIds.entries()) insert.run(input.roomId, id, position);
		return { roomId: input.roomId, fileIds: pinnedFileIds(input.roomId) };
	},
});
