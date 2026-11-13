import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { writeAudit } from './audit.ts';
import { database, schema } from './db/index.ts';
import { emailReady, sendEmail } from './email.ts';
import { emailCopy } from './email-copy.ts';
import { publicOrigin } from './origin.ts';
import { authSecret } from './secrets.ts';

export const inviteDays = 7;
export const apiKeyPrefix = 'or_';

function isRemoved(userId: string) {
	const row = database().sqlite.prepare('SELECT removed_at FROM user WHERE id = ?').get(userId) as
		| { removed_at: number | null }
		| undefined;
	return !row || row.removed_at !== null;
}

function rememberActivity(userId: string, at: number) {
	if (!Number.isFinite(at)) return;
	database()
		.sqlite.prepare('UPDATE user SET last_active_at = max(coalesce(last_active_at, 0), ?) WHERE id = ?')
		.run(at, userId);
}

function hasPassword(userId: string) {
	return !!database()
		.sqlite.prepare("SELECT 1 FROM account WHERE user_id = ? AND provider_id = 'credential'")
		.get(userId);
}

function recentResets(userId: string) {
	return (
		database()
			.sqlite.prepare(
				"SELECT count(*) AS n FROM verification WHERE identifier LIKE 'reset-password:%' AND value = ? AND created_at > ?",
			)
			.get(userId, Date.now() - 15 * 60_000) as { n: number }
	).n;
}

function acceptInvite(userId: string) {
	const sqlite = database().sqlite;
	const now = Date.now();
	const invite = sqlite
		.prepare(
			'SELECT id FROM member_invites WHERE user_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
		)
		.get(userId, now) as { id: string } | undefined;
	if (invite) {
		sqlite.prepare('UPDATE member_invites SET accepted_at = ? WHERE id = ?').run(now, invite.id);
		sqlite.prepare('UPDATE user SET email_verified = 1 WHERE id = ?').run(userId);
	}
	return invite?.id ?? null;
}

function createAuth() {
	const origin = publicOrigin();
	return betterAuth({
		appName: 'OpenRoom',
		baseURL: origin,
		basePath: '/api/auth',
		secret: authSecret(),
		trustedOrigins: [origin],
		database: drizzleAdapter(database().db, { provider: 'sqlite', schema }),
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: 10,
			revokeSessionsOnPasswordReset: true,
			resetPasswordTokenExpiresIn: 60 * 60,
			sendResetPassword: async ({ user, token }) => {
				if (!emailReady() || isRemoved(user.id) || !hasPassword(user.id) || recentResets(user.id) > 1) return;
				try {
					sendEmail(
						user.email,
						emailCopy.passwordReset({ url: `${origin}/admin/invite/${token}` }),
						'email.reset',
					);
				} catch {}
			},
			onPasswordReset: async ({ user }) => {
				const inviteId = acceptInvite(user.id);
				writeAudit({
					userId: user.id,
					operation: inviteId ? 'accept_invite' : 'reset_password',
					targetType: 'member',
					targetId: user.id,
				});
			},
		},
		user: {
			additionalFields: {
				role: { type: 'string', required: true, input: false, defaultValue: 'observer' },
				removedAt: { type: 'date', required: false, input: false },
				emailHmac: { type: 'string', required: false, input: false },
			},
		},
		session: {
			expiresIn: 60 * 60 * 24 * 14,
			updateAge: 60 * 60 * 24,
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session) => {
						if (isRemoved(session.userId)) return false;
						return { data: session };
					},
				},
				delete: {
					before: async (session) => {
						rememberActivity(session.userId, new Date(session.updatedAt).getTime());
					},
				},
			},
		},
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== '/change-password') return;
				const userId = ctx.context.session?.user.id;
				if (!userId || ctx.context.returned instanceof APIError) return;
				writeAudit({ userId, operation: 'change_password', targetType: 'member', targetId: userId });
			}),
		},
		disabledPaths: [
			'/update-user',
			'/delete-user',
			'/change-email',
			'/api-key/create',
			'/api-key/update',
			'/api-key/delete',
			'/api-key/list',
			'/api-key/get',
			'/api-key/delete-all-expired-api-keys',
		],
		rateLimit: { enabled: true, storage: 'memory' },
		advanced: {
			ipAddress: { ipAddressHeaders: ['x-openroom-ip'] },
			cookiePrefix: 'openroom',
		},
		telemetry: { enabled: false },
		plugins: [
			apiKey({
				defaultPrefix: apiKeyPrefix,
				maximumNameLength: 80,
				rateLimit: { enabled: false },
				enableMetadata: true,
			}),
		],
	});
}

type Auth = ReturnType<typeof createAuth>;
const key = Symbol.for('openroom.auth');
const store = globalThis as typeof globalThis & { [key]?: Auth };

export function auth(): Auth {
	store[key] ??= createAuth();
	return store[key];
}

export async function authContext() {
	return auth().$context;
}
