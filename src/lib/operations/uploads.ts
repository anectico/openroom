import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { database } from '../server/db/index.ts';
import { newId } from '../server/ids.ts';
import { enqueue } from '../server/jobs.ts';
import { publicOrigin } from '../server/origin.ts';
import { kindFor, nextPosition, place } from '../server/rooms.ts';
import { randomToken, safeEqual, sha256 } from '../server/secrets.ts';
import { getSetting } from '../server/settings.ts';
import {
	deleteStoredKey,
	diskMarginBytes,
	freeDiskBytes,
	newObjectKey,
	objectBytes,
	writeLocation,
} from '../server/storage.ts';
import { defaultMaxUploadBytes, findUpload, uploadTtlMs } from '../server/uploads.ts';
import { defineOperation, notFound, OpError } from './define.ts';
import { authorize } from './execute.ts';
import { fileOut, loadFile, presentFile } from './files.ts';
import { writableRoom } from './rooms.ts';

const hex64 = z
	.string()
	.regex(/^[a-f0-9]{64}$/i)
	.transform((s) => s.toLowerCase());

export const uploadTarget = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('file').describe('A new file in a room.'),
		roomId: z.string(),
		folderId: z.string().nullable().optional(),
		title: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.optional()
			.describe('Defaults to the file name without extension.'),
		position: z.number().int().min(0).optional(),
	}),
	z.object({
		kind: z.literal('version').describe('A new version of an existing file; investors see it at once.'),
		fileId: z.string(),
	}),
]);

type Target = z.infer<typeof uploadTarget>;

const gb = (n: number) => `${(n / 1024 ** 3).toFixed(n < 1024 ** 3 ? 2 : 1)} GB`;

export function maxUploadBytes() {
	return Number(getSetting('uploads.max_bytes') ?? defaultMaxUploadBytes);
}

function targetRoom(t: Target) {
	if (t.kind === 'file') return writableRoom(t.roomId).id;
	return writableRoom(loadFile(t.fileId).room_id).id;
}

export const createUpload = defineOperation({
	name: 'create_upload',
	summary:
		'Start a file upload. Answers with a URL: send the whole file there as one PUT with Content-Type: application/octet-stream, then call finish_upload.',
	role: 'admin',
	http: { method: 'POST', path: '/uploads' },
	input: z.object({
		target: uploadTarget,
		name: z.string().trim().min(1).max(255).describe('The file name, used for the title and downloads.'),
		size: z.number().int().min(1).describe('The exact size in bytes.'),
		sha256: hex64.optional().describe('The file’s SHA-256 in hex, checked when the upload finishes.'),
	}),
	output: z.object({
		uploadId: z.string(),
		url: z.string(),
		method: z.literal('PUT'),
		headers: z.record(z.string(), z.string()),
		expiresAt: z.number(),
	}),
	audit: {
		target: (i, o) => ({ type: 'upload', id: o.uploadId, roomId: targetRoom(i.target) }),
		detail: (i) => ({ kind: i.target.kind, size: i.size }),
	},
	run: (input, ctx) => {
		if (getSetting('storage.move.id'))
			throw new OpError(409, 'storage_moving', 'Storage is being moved. Uploads resume when it finishes.');
		targetRoom(input.target);
		const max = maxUploadBytes();
		if (input.size > max)
			throw new OpError(
				413,
				'too_large',
				`Files can be at most ${gb(max)}; this one is ${gb(input.size)}. An owner can raise the limit in Settings.`,
			);
		if (freeDiskBytes() < (writeLocation() === 'disk' ? input.size : 0) + diskMarginBytes)
			throw new OpError(507, 'disk_full', 'The server does not have enough free disk space for this file.');
		const token = randomToken();
		const id = newId('upl');
		const now = Date.now();
		database()
			.sqlite.prepare(
				`INSERT INTO uploads (id, token_hash, created_by, client_ip, target, original_name, expected_size, expected_sha256, object_key, location, expires_at, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				sha256(token),
				ctx.actor.userId,
				ctx.ip,
				JSON.stringify(input.target),
				input.name,
				input.size,
				input.sha256 ?? null,
				newObjectKey(),
				writeLocation(),
				now + uploadTtlMs,
				now,
			);
		return {
			uploadId: id,
			url: `${publicOrigin()}/upload/${token}`,
			method: 'PUT' as const,
			headers: { 'content-type': 'application/octet-stream' },
			expiresAt: now + uploadTtlMs,
		};
	},
});

function titleFrom(name: string) {
	const dot = name.lastIndexOf('.');
	return (dot > 0 ? name.slice(0, dot) : name).slice(0, 200);
}

export const finishedUpload = z.object({
	file: fileOut,
	version: z.number(),
	sha256: z.string(),
	size: z.number(),
});

export const finishUpload = defineOperation({
	name: 'finish_upload',
	summary:
		'Finish an upload after its PUT succeeded: checks size and SHA-256, then adds the file or version.',
	role: 'admin',
	http: { method: 'POST', path: '/uploads/{uploadId}/finish' },
	input: z.object({ uploadId: z.string(), sha256: hex64.optional() }),
	output: finishedUpload,
	audit: {
		target: (_i, o) => ({ type: 'file', id: o.file.id, roomId: o.file.roomId }),
		detail: (i, o) => ({ uploadId: i.uploadId, version: o.version, size: o.size }),
	},
	run: async (input, ctx) => {
		const u = findUpload(input.uploadId);
		if (!u || u.created_by !== ctx.actor.userId || u.finished_at !== null || u.expires_at <= Date.now())
			throw notFound('Pending upload');
		if (u.received_size === null || !u.sha256)
			throw new OpError(
				409,
				'not_received',
				'The file has not been received yet. Send it with PUT to the upload URL first.',
			);
		if (
			[input.sha256, u.expected_sha256].some(
				(expected) => expected && !safeEqual(expected, u.sha256 as string),
			)
		) {
			await deleteStoredKey(u.object_key);
			database()
				.sqlite.prepare('UPDATE uploads SET received_size = NULL, sha256 = NULL WHERE id = ?')
				.run(u.id);
			throw new OpError(
				422,
				'sha256_mismatch',
				'The received file does not match the SHA-256 you gave. It was discarded; send it again.',
			);
		}
		const t = uploadTarget.parse(JSON.parse(u.target));
		const roomId = targetRoom(t);
		const detected = await fileTypeFromBuffer(
			await objectBytes(u.object_key, { start: 0, end: Math.min(u.received_size - 1, 8191) }),
		);
		const contentType = detected?.mime ?? 'application/octet-stream';
		const kind = kindFor(contentType);
		const now = Date.now();
		const sqlite = database().sqlite;
		let fileId = '';
		let version = 1;
		const versionId = newId('ver');
		sqlite
			.transaction(() => {
				authorize(ctx, 'admin');
				if (getSetting('storage.move.id') || findUpload(u.id)?.location !== u.location)
					throw new OpError(
						409,
						'storage_changed',
						'Storage is changing. Retry finishing this upload after the move.',
					);
				targetRoom(t);
				const claimed = sqlite
					.prepare(
						`UPDATE uploads SET finished_at = ? WHERE id = ? AND finished_at IS NULL AND expires_at > ? AND in_progress_since IS NULL AND sha256 = ? AND received_size = ? AND EXISTS (SELECT 1 FROM user WHERE id = uploads.created_by AND removed_at IS NULL AND role IN ('owner', 'admin'))`,
					)
					.run(now, u.id, Date.now(), u.sha256, u.received_size);
				if (!claimed.changes)
					throw new OpError(
						409,
						'upload_changed',
						'The upload changed while finishing. Call finish_upload again.',
					);
				sqlite
					.prepare(
						'INSERT INTO objects (key, location, size, sha256, refcount, created_at) VALUES (?, ?, ?, ?, 1, ?)',
					)
					.run(u.object_key, u.location, u.received_size, u.sha256, now);
				if (t.kind === 'file') {
					fileId = newId('file');
					const folderId = t.folderId ?? null;
					if (folderId) {
						const f = sqlite.prepare('SELECT room_id FROM folders WHERE id = ?').get(folderId) as
							| { room_id: string }
							| undefined;
						if (f?.room_id !== roomId) throw notFound('Folder');
					}
					sqlite
						.prepare(
							'INSERT INTO files (id, room_id, folder_id, kind, title, position, current_version, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
						)
						.run(
							fileId,
							roomId,
							folderId,
							kind,
							t.title ?? titleFrom(u.original_name),
							nextPosition(roomId, folderId),
							now,
						);
					if (t.position !== undefined) place(roomId, folderId, { type: 'file', id: fileId }, t.position);
				} else {
					fileId = t.fileId;
					version =
						(
							sqlite.prepare('SELECT max(version) AS v FROM file_versions WHERE file_id = ?').get(fileId) as {
								v: number;
							}
						).v + 1;
					sqlite
						.prepare('UPDATE files SET current_version = ?, kind = ? WHERE id = ?')
						.run(version, kind, fileId);
				}
				sqlite
					.prepare(
						`INSERT INTO file_versions (id, file_id, version, object_key, original_name, content_type, size, created_by, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					)
					.run(
						versionId,
						fileId,
						version,
						u.object_key,
						u.original_name,
						contentType,
						u.received_size,
						ctx.actor.userId,
						now,
					);
			})
			.immediate();
		if (kind === 'pdf') enqueue('files.pages', { versionId });
		return { file: presentFile(fileId), version, sha256: u.sha256, size: u.received_size };
	},
});
