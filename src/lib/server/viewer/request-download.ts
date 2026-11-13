import { database } from '../db/index.ts';
import { serveVersion } from './serve.ts';

export function requestUpload(id: string) {
	return database()
		.sqlite.prepare(
			`SELECT u.object_key, u.original_name, u.size, u.detected_type, q.room_id FROM file_request_uploads u
			JOIN file_requests q ON q.id = u.request_id WHERE u.id = ?`,
		)
		.get(id) as
		| { object_key: string; original_name: string; size: number; detected_type: string; room_id: string }
		| undefined;
}

export function serveRequestUpload(row: NonNullable<ReturnType<typeof requestUpload>>, request: Request) {
	return serveVersion(
		{
			object_key: row.object_key,
			content_type: 'application/octet-stream',
			original_name: row.original_name,
			size: row.size,
			kind: 'download',
		},
		request,
		true,
	);
}
