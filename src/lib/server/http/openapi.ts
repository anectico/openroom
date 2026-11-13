import { z } from 'zod';
import { operations } from '../../operations/index.ts';
import { publicOrigin } from '../origin.ts';
import { appVersion } from '../paths.ts';

type Schema = {
	[key: string]: unknown;
	properties?: Record<string, unknown>;
	required?: string[];
	anyOf?: Schema[];
	oneOf?: Schema[];
	allOf?: Schema[];
};

function withoutPath(schema: Schema, pathParams: string[]): Schema {
	const result = { ...schema };
	if (schema.properties)
		result.properties = Object.fromEntries(
			Object.entries(schema.properties).filter(([name]) => !pathParams.includes(name)),
		);
	if (schema.required) result.required = schema.required.filter((name) => !pathParams.includes(name));
	for (const key of ['anyOf', 'oneOf', 'allOf'] as const)
		if (schema[key]) result[key] = schema[key].map((branch) => withoutPath(branch, pathParams));
	return result;
}

function requiresBody(schema: Schema): boolean {
	if (schema.required?.length) return true;
	if (schema.allOf?.some(requiresBody)) return true;
	const alternatives = schema.anyOf ?? schema.oneOf;
	return !!alternatives?.length && alternatives.every(requiresBody);
}

const errorSchema = {
	type: 'object',
	properties: {
		error: {
			type: 'object',
			properties: { code: { type: 'string' }, message: { type: 'string' } },
			required: ['code', 'message'],
		},
	},
};

export function openApiDocument() {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const op of operations) {
		const input = z.toJSONSchema(op.input, { io: 'input', unrepresentable: 'any' }) as Schema;
		const output = z.toJSONSchema(op.output, { io: 'output', unrepresentable: 'any' });
		const pathParams = [...op.http.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
		const properties = { ...input.properties };
		const required = new Set(input.required ?? []);
		const parameters: unknown[] = pathParams.map((name) => ({
			name,
			in: 'path',
			required: true,
			schema: { type: 'string' },
		}));
		for (const name of pathParams) {
			delete properties[name];
			required.delete(name);
		}
		const method = op.http.method.toLowerCase();
		const entry: Record<string, unknown> = {
			operationId: op.name,
			summary: op.summary,
			description: `Needs the ${op.role} role.${op.destructive ? ' Destructive: without confirm: true it answers 409 with what would change.' : ''}`,
			'x-openroom-role': op.role,
			'x-openroom-destructive': !!op.destructive,
			parameters,
			responses: {
				'200': { description: 'Done', content: { 'application/json': { schema: output } } },
				default: { description: 'Error', content: { 'application/json': { schema: errorSchema } } },
			},
		};
		if (op.http.method === 'GET') {
			for (const [name, schema] of Object.entries(properties)) {
				parameters.push({ name, in: 'query', required: required.has(name), schema });
			}
		} else {
			const body = withoutPath(input, pathParams);
			entry.requestBody = {
				required: requiresBody(body),
				content: {
					'application/json': {
						schema: body,
					},
				},
			};
		}
		paths[op.http.path] ??= {};
		paths[op.http.path][method] = entry;
	}
	return {
		openapi: '3.1.0',
		info: {
			title: 'OpenRoom API',
			version: appVersion,
			description:
				'Every request needs Authorization: Bearer <API key> and Content-Type: application/json, including DELETE.',
		},
		servers: [{ url: `${publicOrigin()}/api/v1` }],
		components: {
			securitySchemes: { apiKey: { type: 'http', scheme: 'bearer' } },
		},
		security: [{ apiKey: [] }],
		paths,
	};
}
