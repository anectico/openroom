import { Readable } from 'node:stream';
import { z } from 'zod';
import { downloadStream } from '../server/outbound.ts';
import { sha256 } from '../server/secrets.ts';
import { receiveUpload } from '../server/uploads.ts';
import { defineOperation, OpError } from './define.ts';
import { execute } from './execute.ts';
import { createUpload, finishedUpload, finishUpload, maxUploadBytes, uploadTarget } from './uploads.ts';

const targetFields = { target: uploadTarget, name: z.string().trim().min(1).max(255) };
const audit = {
	target: (_input: unknown, result: { file: { id: string; roomId: string } }) => ({
		type: 'file',
		id: result.file.id,
		roomId: result.file.roomId,
	}),
};

export const uploadInline = defineOperation({
	name: 'upload_inline',
	summary:
		'Upload a file up to 750,000 decoded bytes as strict base64, then finish it. Larger files use create_upload, raw PUT and finish_upload.',
	role: 'admin',
	http: { method: 'POST', path: '/uploads/inline' },
	input: z.object({
		...targetFields,
		base64: z
			.string()
			.min(4)
			.max(1_000_000)
			.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
	}),
	output: finishedUpload,
	audit,
	run: async (input, ctx) => {
		const bytes = Buffer.from(input.base64, 'base64');
		if (!bytes.length || bytes.length > 750_000)
			throw new OpError(413, 'too_large', 'Inline files must be between 1 and 750,000 decoded bytes.');
		const pending = (await execute(
			createUpload,
			{ target: input.target, name: input.name, size: bytes.length, sha256: sha256(bytes) },
			ctx,
		)) as { uploadId: string; url: string };
		const received = await receiveUpload(new URL(pending.url).pathname.split('/').at(-1) as string, {
			method: 'PUT',
			contentType: 'application/octet-stream',
			contentLength: String(bytes.length),
			body: Readable.from(bytes),
		});
		if (received.status !== 200)
			throw new OpError(received.status, 'upload_failed', 'The inline upload could not be stored.');
		return finishedUpload.parse(await execute(finishUpload, { uploadId: pending.uploadId }, ctx));
	},
});

export const uploadFromUrl = defineOperation({
	name: 'upload_from_url',
	summary:
		'Import a file from a direct public HTTPS URL. Private addresses and redirects are refused. Supply size when the source omits Content-Length.',
	role: 'admin',
	http: { method: 'POST', path: '/uploads/from-url' },
	input: z.object({
		...targetFields,
		url: z.string().url().max(4096),
		size: z.number().int().positive().optional(),
	}),
	output: finishedUpload,
	audit,
	run: async (input, ctx) => {
		let source: Awaited<ReturnType<typeof downloadStream>>;
		try {
			source = await downloadStream(input.url);
		} catch {
			throw new OpError(
				400,
				'source_unavailable',
				'Use a direct public HTTPS file address. Private networks, redirects and failed downloads are refused.',
			);
		}
		try {
			const size = input.size ?? source.length;
			if (!size)
				throw new OpError(
					400,
					'size_required',
					'The source did not send Content-Length. Supply the exact size in bytes.',
				);
			if (source.length && source.length !== size)
				throw new OpError(400, 'size_mismatch', 'The supplied size does not match the source.');
			if (size > maxUploadBytes())
				throw new OpError(413, 'too_large', 'This source exceeds the configured upload limit.');
			const pending = (await execute(
				createUpload,
				{ target: input.target, name: input.name, size },
				ctx,
			)) as { uploadId: string; url: string };
			const received = await receiveUpload(new URL(pending.url).pathname.split('/').at(-1) as string, {
				method: 'PUT',
				contentType: 'application/octet-stream',
				contentLength: String(size),
				body: source.body,
			});
			if (received.status !== 200)
				throw new OpError(
					received.status,
					'upload_failed',
					'The source transfer did not finish. No document was attached.',
				);
			return finishedUpload.parse(await execute(finishUpload, { uploadId: pending.uploadId }, ctx));
		} finally {
			source.body.destroy();
		}
	},
});
