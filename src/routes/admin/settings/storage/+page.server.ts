import { redirect } from '@sveltejs/kit';
import type { StorageSettings } from '#lib/operations/storage.ts';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.member?.role !== 'owner') redirect(303, '/admin/settings/api-keys');
	return { storage: await runOp<StorageSettings>(locals, 'get_storage_settings') };
};
