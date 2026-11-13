import type { Branding } from '#lib/brand.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	branding: await runOp<Branding>(locals, 'get_branding', { roomId: params.roomId }),
});
