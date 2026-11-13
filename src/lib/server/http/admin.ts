import { error, redirect } from '@sveltejs/kit';
import { OpError } from '../../operations/define.ts';
import { execute } from '../../operations/execute.ts';
import { operationsByName } from '../../operations/index.ts';

type Locals = App.Locals;

export async function runOp<T = Record<string, unknown>>(
	locals: Locals,
	name: string,
	input: Record<string, unknown> = {},
	ip: string | null = null,
): Promise<T> {
	const member = locals.member;
	if (!member) redirect(303, '/admin/login');
	const op = operationsByName.get(name);
	if (!op) throw new Error(`Unknown operation ${name}`);
	try {
		return (await execute(op, input, {
			actor: { userId: member.id, role: member.role, apiKeyId: null, surface: 'admin' },
			ip,
		})) as T;
	} catch (e) {
		if (e instanceof OpError) error(e.status, e.message);
		throw e;
	}
}
