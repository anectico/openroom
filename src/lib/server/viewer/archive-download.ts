import { latestArchive } from '../archive.ts';
import { database } from '../db/index.ts';
import { serveFile } from './serve.ts';

export function serveArchive(roomId: string, request: Request) {
	if (!database().sqlite.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId)) return null;
	const a = latestArchive(roomId);
	if (a?.status !== 'ready' || !a.object_key || a.expires_at < Date.now()) return null;
	return serveFile(a.object_key, a.file_name, request);
}
