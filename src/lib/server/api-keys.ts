import { APIError } from 'better-auth/api';
import { auth } from './auth.ts';
import { findMember, type Role } from './members.ts';

export async function createApiKeyFor(userId: string, name: string) {
	const created = await auth().api.createApiKey({ body: { userId, name } });
	return { id: created.id, key: created.key };
}

export type KeyOwner = { userId: string; role: Role; apiKeyId: string };

export async function verifyBearer(header: string | null): Promise<KeyOwner | null> {
	const match = header?.match(/^Bearer\s+(\S+)$/i);
	if (!match) return null;
	let result: Awaited<ReturnType<ReturnType<typeof auth>['api']['verifyApiKey']>>;
	try {
		result = await auth().api.verifyApiKey({ body: { key: match[1] } });
	} catch (error) {
		if (error instanceof APIError && error.statusCode === 401) return null;
		throw error;
	}
	if (!result.valid || !result.key) return null;
	const member = findMember(result.key.referenceId);
	if (!member || member.removed_at !== null) return null;
	return { userId: member.id, role: member.role, apiKeyId: result.key.id };
}
