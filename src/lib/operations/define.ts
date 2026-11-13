import { z } from 'zod';
import type { Role } from '../server/members.ts';

export type Surface = 'admin' | 'rest' | 'mcp' | 'server';

export type Actor = {
	userId: string;
	role: Role;
	apiKeyId: string | null;
	surface: Surface;
};

export type Context = { actor: Actor; ip: string | null };

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type AuditTarget = { type: string; id: string | null; roomId?: string | null };

export type AuditSpec<I, O> = {
	target: (input: I, output: O) => AuditTarget;
	detail?: (input: I, output: O) => Record<string, unknown>;
};

export type Operation<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> = {
	name: string;
	summary: string;
	role: Role;
	http: { method: HttpMethod; path: string };
	input: I;
	output: O;
	destructive?: (input: z.output<I>, ctx: Context) => string | Promise<string>;
	audit: AuditSpec<z.output<I>, z.output<O>> | false;
	run: (input: z.output<I>, ctx: Context) => z.input<O> | Promise<z.input<O>>;
};

export function defineOperation<I extends z.ZodType, O extends z.ZodType>(op: Operation<I, O>) {
	return op as unknown as Operation;
}

export class OpError extends Error {
	status: number;
	code: string;
	detail?: Record<string, unknown>;
	constructor(status: number, code: string, message: string, detail?: Record<string, unknown>) {
		super(message);
		this.status = status;
		this.code = code;
		this.detail = detail;
	}
}

export const notFound = (what: string) => new OpError(404, 'not_found', `${what} was not found.`);

export const confirmField = {
	confirm: z
		.boolean()
		.optional()
		.describe(
			'Set to true only after your person agreed to the change described in the confirmation answer.',
		),
};

export const ok = z.object({ ok: z.literal(true) });
