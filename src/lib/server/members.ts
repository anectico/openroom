import { authContext, inviteDays } from './auth.ts';
import { database } from './db/index.ts';
import { publicOrigin } from './origin.ts';
import { randomToken } from './secrets.ts';

export type Role = 'owner' | 'admin' | 'observer';
export const roles: Role[] = ['owner', 'admin', 'observer'];

export type MemberRow = {
	id: string;
	name: string;
	email: string;
	role: Role;
	removed_at: number | null;
	created_at: number;
};

export function findMember(id: string) {
	return database()
		.sqlite.prepare('SELECT id, name, email, role, removed_at, created_at FROM user WHERE id = ?')
		.get(id) as MemberRow | undefined;
}

const touched = new Map<string, number>();
const touchEveryMs = 60_000;

export function touchMember(id: string) {
	const now = Date.now();
	if (now - (touched.get(id) ?? 0) < touchEveryMs) return;
	touched.set(id, now);
	database().sqlite.prepare('UPDATE user SET last_active_at = ? WHERE id = ?').run(now, id);
}

export function findMemberByEmail(email: string) {
	return database()
		.sqlite.prepare(
			'SELECT id, name, email, role, removed_at, created_at FROM user WHERE email = ? AND removed_at IS NULL',
		)
		.get(email) as MemberRow | undefined;
}

export function ownerCount() {
	return (
		database()
			.sqlite.prepare(
				"SELECT count(*) AS n FROM user u WHERE u.role = 'owner' AND u.removed_at IS NULL AND EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential')",
			)
			.get() as { n: number }
	).n;
}

export async function createMemberUser(email: string, role: Role, name = '') {
	const ctx = await authContext();
	const user = await ctx.internalAdapter.createUser(
		{
			email,
			name: name || email.split('@')[0],
			emailVerified: false,
			role,
		},
		{ method: 'admin' },
	);
	return user.id;
}

export async function setPasswordWithHash(userId: string, password: string) {
	const ctx = await authContext();
	const hash = await ctx.password.hash(password);
	const accounts = await ctx.internalAdapter.findAccounts(userId);
	if (accounts.some((a) => a.providerId === 'credential')) {
		await ctx.internalAdapter.updatePassword(userId, hash);
	} else {
		await ctx.internalAdapter.linkAccount({
			userId,
			providerId: 'credential',
			accountId: userId,
			password: hash,
		});
	}
}

export async function createPasswordLink(userId: string, expiresInMs = inviteDays * 24 * 60 * 60_000) {
	const ctx = await authContext();
	const token = randomToken(24);
	await ctx.internalAdapter.createVerificationValue({
		identifier: `reset-password:${token}`,
		value: userId,
		expiresAt: new Date(Date.now() + expiresInMs),
	});
	return { url: `${publicOrigin()}/admin/invite/${token}`, expiresAt: Date.now() + expiresInMs };
}

export function deletePasswordLinks(userId: string) {
	database()
		.sqlite.prepare("DELETE FROM verification WHERE identifier LIKE 'reset-password:%' AND value = ?")
		.run(userId);
}
