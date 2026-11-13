import { z } from 'zod';
import { writeAudit } from '../server/audit.ts';
import { database } from '../server/db/index.ts';
import { findMember, type Role } from '../server/members.ts';
import { RoomStateError } from '../server/rooms.ts';
import { type Context, OpError, type Operation } from './define.ts';

const rank: Record<Role, number> = { observer: 1, admin: 2, owner: 3 };

export function allowed(role: Role, required: Role) {
	return rank[role] >= rank[required];
}

export function authorize(ctx: Context, required: Role): Context {
	const member = findMember(ctx.actor.userId);
	if (!member || member.removed_at !== null)
		throw new OpError(401, 'unauthorized', 'Your membership is no longer active.');
	if (
		ctx.actor.apiKeyId &&
		!database()
			.sqlite.prepare(
				'SELECT 1 FROM apikey WHERE id = ? AND reference_id = ? AND enabled = 1 AND (expires_at IS NULL OR expires_at > ?)',
			)
			.get(ctx.actor.apiKeyId, member.id, Date.now())
	)
		throw new OpError(401, 'unauthorized', 'This API key is no longer active.');
	if (!allowed(member.role, required))
		throw new OpError(403, 'forbidden', `This operation needs the ${required} role; you are ${member.role}.`);
	return { ...ctx, actor: { ...ctx.actor, role: member.role } };
}

export async function execute(op: Operation, rawInput: unknown, ctx: Context) {
	ctx = authorize(ctx, op.role);
	const parsed = op.input.safeParse(rawInput ?? {});
	if (!parsed.success) {
		throw new OpError(400, 'invalid_input', z.prettifyError(parsed.error), {
			issues: parsed.error.issues,
		});
	}
	const input = parsed.data as Record<string, unknown>;
	if (op.destructive && input.confirm !== true) {
		const wouldChange = await op.destructive(input, ctx);
		throw new OpError(
			409,
			'confirmation_required',
			`${wouldChange} Ask your person before calling ${op.name} again with confirm: true.`,
			{ wouldChange },
		);
	}
	const audit = (output: unknown) => {
		if (!op.audit) return;
		const target = op.audit.target(input, output);
		writeAudit({
			userId: ctx.actor.userId,
			apiKeyId: ctx.actor.apiKeyId,
			roomId: target.roomId ?? null,
			operation: op.name,
			targetType: target.type,
			targetId: target.id,
			detail: { surface: ctx.actor.surface, ...op.audit.detail?.(input, output) },
		});
	};
	let output: unknown;
	try {
		if (op.run.constructor.name === 'AsyncFunction') {
			output = op.output.parse(await op.run(input, ctx));
			audit(output);
		} else {
			const transaction = database().sqlite.transaction(() => {
				const result = op.run(input, ctx);
				if (result instanceof Promise) throw new Error(`${op.name} returned a promise from a plain function`);
				const parsed = op.output.parse(result);
				audit(parsed);
				return parsed;
			});
			output = op.http.method === 'GET' ? transaction() : transaction.immediate();
		}
	} catch (e) {
		if (e instanceof RoomStateError) throw new OpError(409, e.code, e.message);
		throw e;
	}
	return output;
}
