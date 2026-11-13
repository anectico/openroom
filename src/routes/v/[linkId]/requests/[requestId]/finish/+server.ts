import { json } from '@sveltejs/kit';
import { finishRequestUpload, RequestUploadError } from '#lib/server/requests.ts';
import { failJson, requestContext } from '#lib/server/viewer/request-routes.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { ctx, request } = requestContext(event);
	const body = (await event.request.json().catch(() => null)) as { uploadId?: unknown } | null;
	try {
		return json(await finishRequestUpload(ctx, request, String(body?.uploadId ?? '')));
	} catch (e) {
		if (e instanceof RequestUploadError) return failJson(e.status, e.message);
		throw e;
	}
};
