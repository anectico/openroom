import { writeAudit } from './audit.ts';
import { normaliseEmail } from './emails.ts';
import { createMemberUser, findMemberByEmail, setPasswordWithHash } from './members.ts';
import { getSetting, setSetting } from './settings.ts';

export async function seedOwner() {
	if (getSetting('seed.owner')) return;
	const raw = process.env.ADMIN_EMAIL;
	if (!raw) {
		console.log('No ADMIN_EMAIL is set, so no owner was created yet.');
		return;
	}
	const email = normaliseEmail(raw);
	if (!email) throw new Error(`ADMIN_EMAIL is not a valid email: ${raw}`);
	const existing = findMemberByEmail(email);
	const userId = existing?.id ?? (await createMemberUser(email, 'owner'));
	const password = process.env.ADMIN_PASSWORD;
	if (password) {
		await setPasswordWithHash(userId, password);
	} else {
		console.log(
			`Created the owner ${email} without a password. Run: openroom-server reset-password ${email}`,
		);
	}
	writeAudit({ operation: 'seed_owner', targetType: 'member', targetId: userId });
	setSetting('seed.owner', String(Date.now()));
}
