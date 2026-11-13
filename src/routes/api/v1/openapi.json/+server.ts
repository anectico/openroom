import { json } from '@sveltejs/kit';
import { openApiDocument } from '#lib/server/http/openapi.ts';

export const GET = () => json(openApiDocument());
