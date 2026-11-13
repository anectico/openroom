import { handleRest } from '#lib/server/http/rest.ts';
import type { RequestHandler } from './$types';

const handle: RequestHandler = ({ request, params, getClientAddress }) =>
	handleRest(request, `/${params.path}`, getClientAddress());

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
