import { json } from '@sveltejs/kit';
import { RequestUploadError, startRequestUpload } from '#lib/server/requests.ts';
import { failJson, requestContext } from '#lib/server/viewer/request-routes.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as { name?: unknown; size?: unknown } | null;
	const { ctx, request } = requestContext(event);
	const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'upload';
	try {
		return json(startRequestUpload(ctx, request, name, Number(body?.size), event.getClientAddress()));
	} catch (e) {
		if (e instanceof RequestUploadError) return failJson(e.status, e.message);
		throw e;
	}
};
