import { z } from 'zod';
import { inviteDays } from '../server/auth.ts';
import { database } from '../server/db/index.ts';
import { emailReady, sendEmail } from '../server/email.ts';
import { emailCopy } from '../server/email-copy.ts';
import { normaliseEmail } from '../server/emails.ts';
import { newId } from '../server/ids.ts';
import {
	createMemberUser,
	createPasswordLink,
	deletePasswordLinks,
	findMember,
	findMemberByEmail,
	ownerCount,
	roles,
} from '../server/members.ts';
import { hmac } from '../server/settings.ts';
import { confirmField, defineOperation, notFound, OpError, ok } from './define.ts';
import { authorize } from './execute.ts';

const role = z.enum(roles);

const member = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	role,
	createdAt: z.number(),
	lastActiveAt: z.number().nullable(),
});

const invite = z.object({
	id: z.string(),
	memberId: z.string(),
	email: z.string(),
	role,
	expiresAt: z.number(),
	expired: z.boolean(),
});

const inviteWithLink = invite.extend({
	url: z.string().describe('The one-time link that lets the invitee set a password. Shown only now.'),
	emailed: z.boolean().describe('Whether the link was emailed; otherwise send it yourself.'),
});

const sendEmailField = z
	.boolean()
	.default(true)
	.describe('Email the link when email is set up. Without email, send the returned link yourself.');

function emailInvite(email: string, url: string, inviterId: string, send: boolean) {
	if (!send || !emailReady()) return false;
	const inviter = findMember(inviterId);
	try {
		sendEmail(
			email,
			emailCopy.memberInvite({
				inviter: inviter?.name || inviter?.email || 'An owner',
				url,
				days: inviteDays,
			}),
		);
		return true;
	} catch {
		return false;
	}
}

const memberId = z.object({ memberId: z.string() });
const inviteId = z.object({ inviteId: z.string() });

function inviteRow(id: string) {
	return database()
		.sqlite.prepare(
			'SELECT id, user_id, email, role, expires_at, accepted_at FROM member_invites WHERE id = ?',
		)
		.get(id) as
		| {
				id: string;
				user_id: string;
				email: string;
				role: string;
				expires_at: number;
				accepted_at: number | null;
		  }
		| undefined;
}

function hasPassword(userId: string) {
	return !!database()
		.sqlite.prepare("SELECT 1 FROM account WHERE user_id = ? AND provider_id = 'credential'")
		.get(userId);
}

function passwordLinkId(url: string) {
	return `reset-password:${new URL(url).pathname.split('/').at(-1)}`;
}

function keepPasswordLink(userId: string, url: string) {
	database()
		.sqlite.prepare(
			"DELETE FROM verification WHERE identifier LIKE 'reset-password:%' AND value = ? AND identifier != ?",
		)
		.run(userId, passwordLinkId(url));
}

function discardPasswordLink(userId: string, url: string) {
	database()
		.sqlite.prepare('DELETE FROM verification WHERE identifier = ? AND value = ?')
		.run(passwordLinkId(url), userId);
}

function activeMember(id: string) {
	const m = findMember(id);
	if (!m || m.removed_at !== null || !hasPassword(id)) throw notFound('Member');
	return m;
}

export const getMe = defineOperation({
	name: 'get_me',
	summary: 'Show who this API key or session belongs to and its role.',
	role: 'observer',
	http: { method: 'GET', path: '/me' },
	input: z.object({}),
	output: member.pick({ id: true, name: true, email: true, role: true }),
	audit: false,
	run: (_input, ctx) => {
		const m = findMember(ctx.actor.userId);
		if (!m) throw notFound('Member');
		return { id: m.id, name: m.name, email: m.email, role: m.role };
	},
});

export const updateProfile = defineOperation({
	name: 'update_profile',
	summary: 'Change your own display name.',
	role: 'observer',
	http: { method: 'PATCH', path: '/me' },
	input: z.object({ name: z.string().trim().min(1).max(80) }),
	output: member.pick({ id: true, name: true, email: true, role: true }),
	audit: { target: (_i, o) => ({ type: 'member', id: o.id }) },
	run: (input, ctx) => {
		database().sqlite.prepare('UPDATE user SET name = ? WHERE id = ?').run(input.name, ctx.actor.userId);
		const m = findMember(ctx.actor.userId);
		if (!m) throw notFound('Member');
		return { id: m.id, name: m.name, email: m.email, role: m.role };
	},
});

export const listMembers = defineOperation({
	name: 'list_members',
	summary: 'List members with their role and last activity, and pending invites.',
	role: 'owner',
	http: { method: 'GET', path: '/members' },
	input: z.object({}),
	output: z.object({ members: z.array(member), invites: z.array(invite) }),
	audit: false,
	run: () => {
		const sqlite = database().sqlite;
		const members = sqlite
			.prepare(
				`SELECT u.id, u.name, u.email, u.role, u.created_at AS createdAt,
					nullif(max(coalesce((SELECT max(s.updated_at) FROM session s WHERE s.user_id = u.id), 0), coalesce(u.last_active_at, 0)), 0) AS lastActiveAt
				FROM user u
				WHERE u.removed_at IS NULL AND EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential')
				ORDER BY u.created_at`,
			)
			.all() as z.input<typeof member>[];
		const now = Date.now();
		const invites = (
			sqlite
				.prepare(
					'SELECT id, user_id AS memberId, email, role, expires_at AS expiresAt FROM member_invites WHERE accepted_at IS NULL ORDER BY created_at',
				)
				.all() as Omit<z.input<typeof invite>, 'expired'>[]
		).map((i) => ({ ...i, expired: i.expiresAt <= now }));
		return { members, invites };
	},
});

export const inviteMember = defineOperation({
	name: 'invite_member',
	summary: `Invite a member by email with a role. Returns a one-time link, valid ${inviteDays} days, to send to them.`,
	role: 'owner',
	http: { method: 'POST', path: '/members/invites' },
	input: z.object({ email: z.string(), role, sendEmail: sendEmailField }),
	output: inviteWithLink,
	audit: {
		target: (_i, o) => ({ type: 'member', id: o.memberId }),
		detail: (i, o) => ({ role: i.role, inviteId: o.id }),
	},
	run: async (input, ctx) => {
		const email = normaliseEmail(input.email);
		if (!email) throw new OpError(400, 'invalid_email', `${input.email} is not a valid email.`);
		const existing = findMemberByEmail(email);
		if (existing && hasPassword(existing.id))
			throw new OpError(409, 'already_member', `${email} is already a member.`);
		const sqlite = database().sqlite;
		const userId = existing?.id ?? (await createMemberUser(email, input.role));
		let link: Awaited<ReturnType<typeof createPasswordLink>> | null = null;
		try {
			authorize(ctx, 'owner');
			const created = await createPasswordLink(userId);
			link = created;
			return sqlite
				.transaction(() => {
					authorize(ctx, 'owner');
					const current = findMember(userId);
					if (!current || current.removed_at !== null || hasPassword(userId))
						throw new OpError(
							409,
							'member_changed',
							'This member changed while the invite was being prepared. Reload and try again.',
						);
					const id = newId('inv');
					sqlite.prepare('UPDATE user SET role = ? WHERE id = ?').run(input.role, userId);
					sqlite.prepare('DELETE FROM member_invites WHERE user_id = ?').run(userId);
					keepPasswordLink(userId, created.url);
					sqlite
						.prepare(
							'INSERT INTO member_invites (id, user_id, email, role, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
						)
						.run(id, userId, email, input.role, ctx.actor.userId, created.expiresAt, Date.now());
					return {
						id,
						memberId: userId,
						email,
						role: input.role,
						expiresAt: created.expiresAt,
						expired: false,
						url: created.url,
						emailed: emailInvite(email, created.url, ctx.actor.userId, input.sendEmail),
					};
				})
				.immediate();
		} catch (error) {
			if (link) discardPasswordLink(userId, link.url);
			if (!existing && !hasPassword(userId))
				sqlite
					.prepare(
						'DELETE FROM user WHERE id = ? AND removed_at IS NULL AND NOT EXISTS (SELECT 1 FROM member_invites WHERE user_id = ?)',
					)
					.run(userId, userId);
			throw error;
		}
	},
});

export const resendInvite = defineOperation({
	name: 'resend_invite',
	summary: `Make a new invite link for a pending invite, valid another ${inviteDays} days. The old link stops working.`,
	role: 'owner',
	http: { method: 'POST', path: '/members/invites/{inviteId}/resend' },
	input: inviteId.extend({ sendEmail: sendEmailField }),
	output: inviteWithLink,
	audit: {
		target: (_i, o) => ({ type: 'member', id: o.memberId }),
		detail: (i) => ({ inviteId: i.inviteId }),
	},
	run: async (input, ctx) => {
		const row = inviteRow(input.inviteId);
		if (!row || row.accepted_at !== null) throw notFound('Pending invite');
		const link = await createPasswordLink(row.user_id);
		try {
			return database()
				.sqlite.transaction(() => {
					authorize(ctx, 'owner');
					const current = inviteRow(row.id);
					const member = findMember(row.user_id);
					if (!current || current.accepted_at !== null || !member || member.removed_at !== null)
						throw notFound('Pending invite');
					if (current.expires_at !== row.expires_at)
						throw new OpError(
							409,
							'invite_changed',
							'This invite changed while it was being resent. Reload it and try again.',
						);
					keepPasswordLink(row.user_id, link.url);
					database()
						.sqlite.prepare('UPDATE member_invites SET expires_at = ? WHERE id = ?')
						.run(link.expiresAt, row.id);
					return {
						id: row.id,
						memberId: row.user_id,
						email: row.email,
						role: role.parse(row.role),
						expiresAt: link.expiresAt,
						expired: false,
						url: link.url,
						emailed: emailInvite(row.email, link.url, ctx.actor.userId, input.sendEmail),
					};
				})
				.immediate();
		} catch (error) {
			discardPasswordLink(row.user_id, link.url);
			throw error;
		}
	},
});

export const cancelInvite = defineOperation({
	name: 'cancel_invite',
	summary: 'Cancel a pending invite; its link stops working.',
	role: 'owner',
	http: { method: 'DELETE', path: '/members/invites/{inviteId}' },
	input: inviteId,
	output: ok,
	audit: { target: (i) => ({ type: 'invite', id: i.inviteId }) },
	run: (input) => {
		const row = inviteRow(input.inviteId);
		if (!row || row.accepted_at !== null) throw notFound('Pending invite');
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				deletePasswordLinks(row.user_id);
				if (hasPassword(row.user_id)) {
					sqlite.prepare('DELETE FROM member_invites WHERE id = ?').run(row.id);
				} else {
					sqlite.prepare('DELETE FROM user WHERE id = ?').run(row.user_id);
				}
			})
			.immediate();
		return { ok: true as const };
	},
});

export const changeMemberRole = defineOperation({
	name: 'change_member_role',
	summary:
		'Change a member’s role. The last owner cannot be demoted. Their API keys follow the new role at once.',
	role: 'owner',
	http: { method: 'PATCH', path: '/members/{memberId}' },
	input: memberId.extend({ role }),
	output: member,
	audit: { target: (i) => ({ type: 'member', id: i.memberId }), detail: (i) => ({ role: i.role }) },
	run: (input) => {
		const m = activeMember(input.memberId);
		if (m.role === 'owner' && input.role !== 'owner' && ownerCount() <= 1)
			throw new OpError(
				409,
				'last_owner',
				'The last owner cannot be demoted. Make someone else an owner first.',
			);
		database().sqlite.prepare('UPDATE user SET role = ? WHERE id = ?').run(input.role, m.id);
		return {
			id: m.id,
			name: m.name,
			email: m.email,
			role: input.role,
			createdAt: m.created_at,
			lastActiveAt: null,
		};
	},
});

export const removeMember = defineOperation({
	name: 'remove_member',
	summary:
		'Remove a member: signs them out everywhere and revokes their API keys. The last owner cannot be removed.',
	role: 'owner',
	http: { method: 'DELETE', path: '/members/{memberId}' },
	input: memberId.extend(confirmField),
	output: ok,
	destructive: (input) => {
		const m = activeMember(input.memberId);
		const keys = (
			database().sqlite.prepare('SELECT count(*) AS n FROM apikey WHERE reference_id = ?').get(m.id) as {
				n: number;
			}
		).n;
		return `This removes ${m.email} (${m.role}), signs them out and revokes ${keys} API key(s).`;
	},
	audit: { target: (i) => ({ type: 'member', id: i.memberId }) },
	run: (input) => {
		const m = activeMember(input.memberId);
		if (m.role === 'owner' && ownerCount() <= 1)
			throw new OpError(
				409,
				'last_owner',
				'The last owner cannot be removed. Make someone else an owner first.',
			);
		const sqlite = database().sqlite;
		sqlite
			.transaction(() => {
				sqlite
					.prepare('UPDATE user SET email = ?, email_hmac = ?, removed_at = ?, name = ? WHERE id = ?')
					.run(`removed-${m.id}@invalid`, hmac(m.email), Date.now(), m.name, m.id);
				sqlite.prepare('DELETE FROM session WHERE user_id = ?').run(m.id);
				sqlite.prepare('DELETE FROM account WHERE user_id = ?').run(m.id);
				sqlite.prepare('DELETE FROM apikey WHERE reference_id = ?').run(m.id);
				sqlite.prepare('DELETE FROM member_invites WHERE user_id = ?').run(m.id);
				sqlite
					.prepare('UPDATE uploads SET expires_at = 0 WHERE created_by = ? AND finished_at IS NULL')
					.run(m.id);
				deletePasswordLinks(m.id);
			})
			.immediate();
		return { ok: true as const };
	},
});
