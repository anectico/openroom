import { randomBytes } from 'node:crypto';
import { database } from './db/index.ts';
import { decrypt, encrypt, hmacWith } from './secrets.ts';

type Row = { value: string | null; value_enc: string | null };

function row(key: string) {
	return database().sqlite.prepare('SELECT value, value_enc FROM settings WHERE key = ?').get(key) as
		| Row
		| undefined;
}

export function getSetting(key: string) {
	return row(key)?.value ?? null;
}

export function getSecretSetting(key: string) {
	const enc = row(key)?.value_enc;
	return enc ? decrypt(enc) : null;
}

function write(key: string, value: string | null, valueEnc: string | null) {
	database()
		.sqlite.prepare(
			'INSERT INTO settings (key, value, value_enc, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, value_enc = excluded.value_enc, updated_at = excluded.updated_at',
		)
		.run(key, value, valueEnc, Date.now());
}

export function setSetting(key: string, value: string | null) {
	write(key, value, null);
}

export function setSecretSetting(key: string, value: string | null) {
	write(key, null, value === null ? null : encrypt(value));
}

export function deleteSetting(key: string) {
	database().sqlite.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

let hmacKey: Buffer | null = null;

export function hmac(value: string) {
	if (!hmacKey) {
		let stored = getSecretSetting('crypto.hmac_key');
		if (!stored) {
			stored = randomBytes(32).toString('hex');
			setSecretSetting('crypto.hmac_key', stored);
		}
		hmacKey = Buffer.from(stored, 'hex');
	}
	return hmacWith(hmacKey, value);
}
