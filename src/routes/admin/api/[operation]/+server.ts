import { json } from '@sveltejs/kit';
import { OpError } from '#lib/operations/define.ts';
import { execute } from '#lib/operations/execute.ts';
import { operationsByName } from '#lib/operations/index.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	const member = locals.member;
	if (!member) return json({ error: { code: 'unauthorized', message: 'Sign in again.' } }, { status: 401 });
	const op = operationsByName.get(params.operation);
	if (!op) return json({ error: { code: 'not_found', message: 'Unknown operation.' } }, { status: 404 });
	if (!request.headers.get('content-type')?.startsWith('application/json'))
		return json({ error: { code: 'unsupported_media_type', message: 'Send JSON.' } }, { status: 415 });
	const input = await request.json().catch(() => null);
	if (!input || typeof input !== 'object' || Array.isArray(input))
		return json({ error: { code: 'invalid_json', message: 'Send a valid JSON object.' } }, { status: 400 });
	try {
		const output = await execute(op, input, {
			actor: { userId: member.id, role: member.role, apiKeyId: null, surface: 'admin' },
			ip: getClientAddress(),
		});
		return json(output);
	} catch (e) {
		if (e instanceof OpError)
			return json({ error: { code: e.code, message: e.message, ...e.detail } }, { status: e.status });
		console.error(`admin ${op.name} failed`, e);
		return json(
			{ error: { code: 'internal', message: 'Something went wrong on the server.' } },
			{ status: 500 },
		);
	}
};
