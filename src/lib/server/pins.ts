import { database } from './db/index.ts';
import type { TreeNode } from './rooms.ts';

export function pinnedFileIds(roomId: string) {
	return (
		database()
			.sqlite.prepare('SELECT file_id FROM room_pins WHERE room_id = ? ORDER BY position')
			.all(roomId) as { file_id: string }[]
	).map((pin) => pin.file_id);
}

export function visiblePins(roomId: string, visibleTree: TreeNode[]) {
	const files = new Map(visibleTree.filter((node) => node.type === 'file').map((node) => [node.id, node]));
	return pinnedFileIds(roomId).flatMap((id) => {
		const file = files.get(id);
		return file ? [file] : [];
	});
}
