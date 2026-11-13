import { z } from 'zod';
import { createApiKeyFor } from '../server/api-keys.ts';
import { database } from '../server/db/index.ts';
import { publicOrigin } from '../server/origin.ts';
import { defineOperation, notFound, OpError, ok } from './define.ts';
import { authorize } from './execute.ts';

const apiKey = z.object({
	id: z.string(),
	name: z.string().nullable(),
	start: z.string().nullable().describe('The first characters of the key, to tell keys apart.'),
	memberId: z.string(),
	memberEmail: z.string(),
	createdAt: z.number(),
	lastUsedAt: z.number().nullable(),
});

export const listApiKeys = defineOperation({
	name: 'list_api_keys',
	summary: 'List your own API keys. Owners can pass all: true to see every member’s keys.',
	role: 'observer',
	http: { method: 'GET', path: '/api-keys' },
	input: z.object({ all: z.union([z.boolean(), z.stringbool()]).optional() }),
	output: z.object({ keys: z.array(apiKey) }),
	audit: false,
	run: (input, ctx) => {
		if (input.all && ctx.actor.role !== 'owner')
			throw new OpError(403, 'forbidden', 'Only owners can list every member’s keys.');
		const rows = database()
			.sqlite.prepare(
				`SELECT k.id, k.name, k.start, k.reference_id AS memberId, u.email AS memberEmail,
					k.created_at AS createdAt, k.last_request AS lastUsedAt
				FROM apikey k JOIN user u ON u.id = k.reference_id
				WHERE (? = 1 OR k.reference_id = ?) ORDER BY k.created_at`,
			)
			.all(input.all ? 1 : 0, ctx.actor.userId) as z.input<typeof apiKey>[];
		return { keys: rows };
	},
});

export const createApiKey = defineOperation({
	name: 'create_api_key',
	summary:
		'Create an API key for yourself. It acts with your role, looked up on every request. The key is shown only in this answer.',
	role: 'observer',
	http: { method: 'POST', path: '/api-keys' },
	input: z.object({ name: z.string().trim().min(1).max(80) }),
	output: z.object({
		id: z.string(),
		name: z.string(),
		key: z.string(),
		mcpUrl: z.string(),
		apiUrl: z.string(),
	}),
	audit: { target: (_i, o) => ({ type: 'api_key', id: o.id }) },
	run: async (input, ctx) => {
		const created = await createApiKeyFor(ctx.actor.userId, input.name);
		try {
			authorize(ctx, 'observer');
		} catch (error) {
			database().sqlite.prepare('DELETE FROM apikey WHERE id = ?').run(created.id);
			throw error;
		}
		const origin = publicOrigin();
		return { ...created, name: input.name, mcpUrl: `${origin}/mcp`, apiUrl: `${origin}/api/v1` };
	},
});

export const revokeApiKey = defineOperation({
	name: 'revoke_api_key',
	summary: 'Revoke an API key; it stops working at once. Owners can revoke any member’s key.',
	role: 'observer',
	http: { method: 'DELETE', path: '/api-keys/{keyId}' },
	input: z.object({ keyId: z.string() }),
	output: ok,
	audit: { target: (i) => ({ type: 'api_key', id: i.keyId }) },
	run: (input, ctx) => {
		const sqlite = database().sqlite;
		const row = sqlite.prepare('SELECT reference_id FROM apikey WHERE id = ?').get(input.keyId) as
			| { reference_id: string }
			| undefined;
		if (!row || (row.reference_id !== ctx.actor.userId && ctx.actor.role !== 'owner'))
			throw notFound('API key');
		sqlite.prepare('DELETE FROM apikey WHERE id = ?').run(input.keyId);
		return { ok: true as const };
	},
});
