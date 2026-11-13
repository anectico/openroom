import { Readable } from 'node:stream';
import { database } from '../db/index.ts';
import { objectSize, objectStream } from '../storage.ts';

type Version = {
	object_key: string;
	content_type: string;
	original_name: string;
	size: number;
	kind: string;
};

export function currentVersion(fileId: string) {
	return database()
		.sqlite.prepare(
			`SELECT v.object_key, v.content_type, v.original_name, v.size, f.kind
			FROM files f JOIN file_versions v ON v.file_id = f.id AND v.version = f.current_version WHERE f.id = ?`,
		)
		.get(fileId) as Version | undefined;
}

export function currentVersionId(fileId: string) {
	return database()
		.sqlite.prepare(
			'SELECT v.id, v.pages, f.kind FROM files f JOIN file_versions v ON v.file_id = f.id AND v.version = f.current_version WHERE f.id = ?',
		)
		.get(fileId) as { id: string; pages: number | null; kind: string } | undefined;
}

function dispositionName(name: string) {
	const clean =
		[...name]
			.filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && c !== '"' && c !== '\\')
			.join('')
			.slice(0, 200)
			.toWellFormed() || 'file';
	const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
	return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

export async function serveVersion(version: Version, request: Request, attachment: boolean) {
	const size = await objectSize(version.object_key);
	const headers = new Headers({
		'content-type': attachment ? 'application/octet-stream' : version.content_type,
		'x-content-type-options': 'nosniff',
		'content-security-policy': 'sandbox',
		'cache-control': 'private, no-store',
		'accept-ranges': 'bytes',
		'content-disposition': `${attachment ? 'attachment' : 'inline'}; ${dispositionName(version.original_name)}`,
	});
	const range = request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
	if (range && (range[1] || range[2])) {
		let start = range[1] ? Number(range[1]) : size - Number(range[2]);
		let end = range[1] && range[2] ? Number(range[2]) : size - 1;
		start = Math.max(0, start);
		end = Math.min(end, size - 1);
		if (start > end || start >= size) {
			headers.set('content-range', `bytes */${size}`);
			return new Response(null, { status: 416, headers });
		}
		headers.set('content-range', `bytes ${start}-${end}/${size}`);
		headers.set('content-length', String(end - start + 1));
		const body =
			request.method === 'HEAD'
				? null
				: (Readable.toWeb(await objectStream(version.object_key, { start, end })) as ReadableStream);
		return new Response(request.method === 'HEAD' ? null : body, { status: 206, headers });
	}
	headers.set('content-length', String(size));
	const body =
		request.method === 'HEAD'
			? null
			: (Readable.toWeb(await objectStream(version.object_key)) as ReadableStream);
	return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}

export function serveFile(path: string, fileName: string, request: Request) {
	return serveVersion(
		{
			object_key: path,
			content_type: fileName.endsWith('.pdf')
				? 'application/pdf'
				: fileName.endsWith('.csv')
					? 'text/csv'
					: 'application/zip',
			original_name: fileName,
			size: 0,
			kind: 'download',
		},
		request,
		true,
	);
}
