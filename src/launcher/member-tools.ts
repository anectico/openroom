import { createApiKeyFor } from '../lib/server/api-keys.ts';
import { writeAudit } from '../lib/server/audit.ts';
import { normaliseEmail } from '../lib/server/emails.ts';
import { createPasswordLink, deletePasswordLinks, findMemberByEmail } from '../lib/server/members.ts';
import { publicOrigin } from '../lib/server/origin.ts';

const resetHours = 24;

function member(raw: string | undefined) {
	const email = raw ? normaliseEmail(raw) : null;
	if (!email) throw new Error('Give the member’s email, for example: reset-password you@example.com');
	const found = findMemberByEmail(email);
	if (!found) throw new Error(`${email} is not a member.`);
	return found;
}

export async function resetPassword(raw: string | undefined) {
	const m = member(raw);
	deletePasswordLinks(m.id);
	const link = await createPasswordLink(m.id, resetHours * 60 * 60_000);
	writeAudit({ operation: 'server.reset_password', targetType: 'member', targetId: m.id });
	return { email: m.email, url: link.url, expiresAt: new Date(link.expiresAt).toISOString() };
}

export async function createKey(raw: string | undefined, name: string) {
	const m = member(raw);
	const created = await createApiKeyFor(m.id, name);
	writeAudit({ operation: 'server.create_api_key', targetType: 'api_key', targetId: created.id });
	const origin = publicOrigin();
	return {
		email: m.email,
		role: m.role,
		key: created.key,
		apiUrl: `${origin}/api/v1`,
	};
}
