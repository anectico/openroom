import { database } from '#lib/server/db/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const sqlite = database().sqlite;
	const row = sqlite
		.prepare('SELECT value, expires_at FROM verification WHERE identifier = ?')
		.get(`reset-password:${params.token}`) as { value: string; expires_at: number } | undefined;
	const valid = !!row && row.expires_at > Date.now();
	const invite = row
		? !!sqlite
				.prepare('SELECT 1 FROM member_invites WHERE user_id = ? AND accepted_at IS NULL')
				.get(row.value)
		: false;
	return { valid, invite };
};
