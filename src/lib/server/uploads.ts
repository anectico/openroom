import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { database } from './db/index.ts';
import { requestFor } from './requests.ts';
import { sha256 } from './secrets.ts';
import { getSetting } from './settings.ts';
import {
	abortUnfinishedUpload,
	deleteStoredKey,
	diskMarginBytes,
	freeDiskBytes,
	type StorageLocation,
	writeObject,
} from './storage.ts';
import { checkSessionId } from './viewer/access.ts';

export const uploadTtlMs = 24 * 60 * 60_000;
export const defaultMaxUploadBytes = 5 * 1024 ** 3;

export type UploadRow = {
	id: string;
	created_by: string;
	target: string;
	original_name: string;
	expected_size: number;
	expected_sha256: string | null;
	received_size: number | null;
	sha256: string | null;
	object_key: string;
	location: StorageLocation;
	expires_at: number;
	finished_at: number | null;
};

export type ReceiveResult = { status: number; body: Record<string, unknown> };

const fail = (status: number, code: string, message: string): ReceiveResult => ({
	status,
	body: { error: { code, message } },
});

function claim(token: string) {
	const now = Date.now();
	return database()
		.sqlite.prepare(
			`UPDATE uploads SET in_progress_since = ?, received_size = NULL, sha256 = NULL
			WHERE token_hash = ? AND finished_at IS NULL AND expires_at > ? AND in_progress_since IS NULL
				AND (
					EXISTS (SELECT 1 FROM user u WHERE u.id = uploads.created_by AND u.removed_at IS NULL AND u.role IN ('owner', 'admin'))
					OR EXISTS (SELECT 1 FROM viewer_sessions s WHERE 'session:' || s.id = uploads.created_by AND s.ended_at IS NULL AND s.expires_at > ?)
				)
			RETURNING id, expected_size, object_key, location`,
		)
		.get(now, sha256(token), now, now) as
		| { id: string; expected_size: number; object_key: string; location: StorageLocation }
		| undefined;
}

function uploadState(token: string) {
	return database()
		.sqlite.prepare('SELECT in_progress_since FROM uploads WHERE token_hash = ?')
		.get(sha256(token)) as { in_progress_since: number | null } | undefined;
}

export type UploadRequest = {
	method: string;
	contentType: string | null;
	contentLength: string | null;
	body: Readable;
};

export async function receiveUpload(token: string, req: UploadRequest): Promise<ReceiveResult> {
	if (getSetting('storage.move.id'))
		return fail(409, 'storage_moving', 'Storage is being moved. Retry this upload when the move finishes.');
	if (req.method !== 'PUT') return fail(405, 'method_not_allowed', 'Send the file with PUT.');
	if (req.contentType?.split(';')[0].trim() !== 'application/octet-stream')
		return fail(
			415,
			'unsupported_media_type',
			'Send the raw file with Content-Type: application/octet-stream.',
		);
	const declared = req.contentLength ? Number(req.contentLength) : null;
	const row = claim(token);
	if (!row) {
		if (uploadState(token)?.in_progress_since)
			return fail(409, 'in_progress', 'This upload is already being sent.');
		return fail(404, 'not_found', 'This upload URL is unknown, finished or expired. Create a new upload.');
	}
	const release = (size: number | null, hash: string | null) =>
		database()
			.sqlite.prepare(
				'UPDATE uploads SET in_progress_since = NULL, received_size = ?, sha256 = ? WHERE id = ?',
			)
			.run(size, hash, row.id);
	const upload = findUpload(row.id);
	if (upload?.created_by.startsWith('session:')) {
		const check = checkSessionId(upload.created_by.slice(8));
		const target = JSON.parse(upload.target) as { kind: string; requestId?: string };
		if (
			!check.ok ||
			check.ctx.preview ||
			check.ctx.needsNda ||
			!target.requestId ||
			!requestFor(check.ctx, target.requestId)
		) {
			release(null, null);
			return fail(404, 'not_found', 'This file request is no longer available to this session.');
		}
	}
	try {
		return await receiveClaimed(row, declared, req.body, release);
	} catch (error) {
		release(null, null);
		throw error;
	}
}

async function receiveClaimed(
	row: { id: string; expected_size: number; object_key: string; location: StorageLocation },
	declared: number | null,
	body: Readable,
	release: (size: number | null, hash: string | null) => unknown,
): Promise<ReceiveResult> {
	if (declared !== null && declared !== row.expected_size) {
		release(null, null);
		return fail(400, 'size_mismatch', `This upload expects ${row.expected_size} bytes, not ${declared}.`);
	}
	if (freeDiskBytes() < (row.location === 'disk' ? row.expected_size : 0) + diskMarginBytes) {
		release(null, null);
		return fail(507, 'disk_full', 'The server does not have enough free disk space for this file.');
	}
	const hash = createHash('sha256');
	let received = 0;
	const meter = new Transform({
		transform(chunk: Buffer, _encoding, done) {
			received += chunk.length;
			if (received > row.expected_size) {
				done(new Error('too_large'));
				return;
			}
			hash.update(chunk);
			done(null, chunk);
		},
	});
	try {
		await pipeline(body, meter, async (source) => {
			await writeObject(row.object_key, Readable.from(source), row.expected_size, row.location);
		});
	} catch (error) {
		await deleteStoredKey(row.object_key);
		release(null, null);
		if (error instanceof Error && error.message === 'too_large')
			return fail(413, 'too_large', `This upload expects ${row.expected_size} bytes and more were sent.`);
		return fail(400, 'interrupted', 'The upload was interrupted. Send the whole file again.');
	}
	if (received !== row.expected_size) {
		await deleteStoredKey(row.object_key);
		release(null, null);
		return fail(
			400,
			'size_mismatch',
			`Received ${received} bytes; this upload expects ${row.expected_size}.`,
		);
	}
	const digest = hash.digest('hex');
	if (!findUpload(row.id)) {
		await deleteStoredKey(row.object_key);
		return fail(410, 'upload_cancelled', 'This upload is no longer available.');
	}
	release(received, digest);
	return { status: 200, body: { received, sha256: digest } };
}

export function findUpload(id: string) {
	return database().sqlite.prepare('SELECT * FROM uploads WHERE id = ?').get(id) as UploadRow | undefined;
}

export function resetInProgressUploads() {
	database()
		.sqlite.prepare('UPDATE uploads SET in_progress_since = NULL WHERE in_progress_since IS NOT NULL')
		.run();
}

export async function cleanupUploads() {
	const sqlite = database().sqlite;
	const now = Date.now();
	const expired = sqlite
		.prepare(
			'SELECT id, object_key FROM uploads WHERE finished_at IS NULL AND expires_at < ? AND in_progress_since IS NULL',
		)
		.all(now) as { id: string; object_key: string }[];
	for (const u of expired) {
		const kept = sqlite.prepare('SELECT 1 FROM objects WHERE key = ?').get(u.object_key);
		if (!kept) {
			await abortUnfinishedUpload(u.object_key);
			await deleteStoredKey(u.object_key);
		}
		sqlite.prepare('DELETE FROM uploads WHERE id = ?').run(u.id);
	}
	sqlite
		.prepare('DELETE FROM uploads WHERE finished_at IS NOT NULL AND finished_at < ?')
		.run(now - 7 * 86_400_000);
	return expired.length;
}
