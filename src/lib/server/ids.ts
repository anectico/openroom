import { randomBytes } from 'node:crypto';

const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';

export function newId(prefix: string) {
	const bytes = randomBytes(16);
	let out = '';
	for (const b of bytes) out += alphabet[b & 31];
	return `${prefix}_${out}`;
}
