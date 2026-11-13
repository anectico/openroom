import { OpError } from '../../operations/define.ts';
import { execute } from '../../operations/execute.ts';
import { matchRoute } from '../../operations/index.ts';
import { verifyBearer } from '../api-keys.ts';
import { appVersion } from '../paths.ts';

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store',
			'x-openroom-version': appVersion,
			...headers,
		},
	});
}

function error(status: number, code: string, message: string, detail?: Record<string, unknown>) {
	return json(status, { error: { code, message, ...detail } });
}

export async function handleRest(request: Request, path: string, ip: string | null) {
	const owner = await verifyBearer(request.headers.get('authorization'));
	if (!owner)
		return error(401, 'unauthorized', 'Send a valid API key as Authorization: Bearer <key>.', undefined);
	const route = matchRoute(request.method, path);
	if (route === null) return error(404, 'not_found', `No API route ${request.method} ${path}.`);
	if (route === 'method')
		return error(405, 'method_not_allowed', `${request.method} is not allowed on ${path}.`);
	let input: Record<string, unknown>;
	if (request.method === 'GET') {
		input = Object.fromEntries(new URL(request.url).searchParams);
	} else {
		const text = await request.text();
		if (text && !request.headers.get('content-type')?.startsWith('application/json'))
			return error(415, 'unsupported_media_type', 'Send JSON with Content-Type: application/json.');
		try {
			input = text ? JSON.parse(text) : {};
		} catch {
			return error(400, 'invalid_json', 'The request body is not valid JSON.');
		}
		if (!input || typeof input !== 'object' || Array.isArray(input))
			return error(400, 'invalid_json', 'The request body must be a JSON object.');
	}
	try {
		const output = await execute(
			route.op,
			{ ...input, ...route.params },
			{ actor: { ...owner, surface: 'rest' }, ip },
		);
		return json(200, output);
	} catch (e) {
		if (e instanceof OpError) return error(e.status, e.code, e.message, e.detail);
		console.error(`REST ${route.op.name} failed`, e);
		return error(500, 'internal', 'Something went wrong on the server. The error was logged.');
	}
}
