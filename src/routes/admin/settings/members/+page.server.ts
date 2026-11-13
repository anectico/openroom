import { redirect } from '@sveltejs/kit';
import { runOp } from '#lib/server/http/admin.ts';
import type { PageServerLoad } from './$types';

type Role = 'owner' | 'admin' | 'observer';
type Member = {
	id: string;
	name: string;
	email: string;
	role: Role;
	createdAt: number;
	lastActiveAt: number | null;
};
type Invite = {
	id: string;
	memberId: string;
	email: string;
	role: Role;
	expiresAt: number;
	expired: boolean;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.member?.role !== 'owner') redirect(303, '/admin/settings/api-keys');
	return await runOp<{ members: Member[]; invites: Invite[] }>(locals, 'list_members');
};
