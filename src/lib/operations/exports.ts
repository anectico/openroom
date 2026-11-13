import { z } from 'zod';
import { createZipExport, ExportBusyError, findExport } from '../server/exports.ts';
import { publicOrigin } from '../server/origin.ts';
import { defineOperation, notFound, OpError } from './define.ts';
import { loadRoom } from './rooms.ts';

const exportOut = z.object({
	id: z.string(),
	status: z.enum(['pending', 'running', 'ready', 'failed']),
	progress: z.number().describe('0 to 100.'),
	size: z.number().nullable(),
	error: z.string().nullable(),
	downloadUrl: z
		.string()
		.describe('Once ready: GET with your API key (REST) or session (admin pages). Valid 24 hours.'),
	expiresAt: z.number(),
});

function present(id: string, surface: string): z.input<typeof exportOut> {
	const row = findExport(id);
	if (!row) throw notFound('Export');
	const base =
		surface === 'admin' ? `/admin/exports/${row.id}?download=1` : `/api/v1/exports/${row.id}/download`;
	return {
		id: row.id,
		status: row.status,
		progress: row.progress,
		size: row.size,
		error: row.error,
		downloadUrl: `${publicOrigin()}${base}`,
		expiresAt: row.expires_at,
	};
}

export const exportRoomZip = defineOperation({
	name: 'export_room_zip',
	summary:
		'Start building a zip of a whole room (every file, current versions, numbered folders). Poll get_export until ready.',
	role: 'observer',
	http: { method: 'POST', path: '/rooms/{roomId}/zip' },
	input: z.object({ roomId: z.string() }),
	output: exportOut,
	audit: { target: (i, o) => ({ type: 'export', id: o.id, roomId: i.roomId }) },
	run: (input, ctx) => {
		const room = loadRoom(input.roomId);
		try {
			const row = createZipExport({
				roomId: room.id,
				roomName: room.name,
				linkId: null,
				userId: ctx.actor.userId,
				sessionId: null,
			});
			return present(row.id, ctx.actor.surface);
		} catch (e) {
			if (e instanceof ExportBusyError) throw new OpError(429, 'busy', e.message);
			throw e;
		}
	},
});

export const getExport = defineOperation({
	name: 'get_export',
	summary: 'Show the progress of an export you started, and its download address once ready.',
	role: 'observer',
	http: { method: 'GET', path: '/exports/{exportId}' },
	input: z.object({ exportId: z.string() }),
	output: exportOut,
	audit: false,
	run: (input, ctx) => {
		const row = findExport(input.exportId);
		if (!row || row.requested_by_user !== ctx.actor.userId) throw notFound('Export');
		return present(row.id, ctx.actor.surface);
	},
});
