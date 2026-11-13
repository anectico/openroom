import { handleMcp } from '#lib/server/http/mcp.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, getClientAddress }) => handleMcp(request, getClientAddress());
