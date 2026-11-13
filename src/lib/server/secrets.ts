import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	hkdfSync,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths.ts';

export class SecretKeyError extends Error {}

let cached: Buffer | null = null;
let cachedPrevious: Buffer | null | undefined;

function devKey() {
	const file = join(dataDir, 'dev-secret.key');
	if (!existsSync(file)) {
		mkdirSync(dataDir, { recursive: true });
		writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
	}
	return readFileSync(file, 'utf8').trim();
}

function masterKey() {
	if (cached) return cached;
	let raw = process.env.OPENROOM_SECRET_KEY?.trim();
	if (!raw) {
		if (process.env.NODE_ENV === 'production')
			throw new SecretKeyError('OPENROOM_SECRET_KEY is not set. install.sh writes it to .env.');
		raw = devKey();
	}
	if (raw.length < 32) throw new SecretKeyError('OPENROOM_SECRET_KEY must be at least 32 characters.');
	cached = Buffer.from(raw, 'utf8');
	return cached;
}

function previousKey() {
	if (cachedPrevious !== undefined) return cachedPrevious;
	const raw = process.env.OPENROOM_SECRET_KEY_PREVIOUS?.trim();
	cachedPrevious = raw && raw.length >= 32 ? Buffer.from(raw, 'utf8') : null;
	return cachedPrevious;
}

export function hasPreviousKey() {
	return previousKey() !== null;
}

function derive(master: Buffer, purpose: string, length: number) {
	return Buffer.from(hkdfSync('sha256', master, 'openroom', purpose, length));
}

export function deriveKey(purpose: string, length = 32) {
	return derive(masterKey(), purpose, length);
}

export function authSecret() {
	return deriveKey('better-auth').toString('hex');
}

export function encrypt(plaintext: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', deriveKey('settings v1'), iv);
	const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
}

function decryptWith(key: Buffer, value: string) {
	const [version, data] = value.split('.');
	if (version !== 'v1' || !data) throw new SecretKeyError('Unknown encrypted value format.');
	const raw = Buffer.from(data, 'base64url');
	const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
	decipher.setAuthTag(raw.subarray(12, 28));
	return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

export function decrypt(value: string) {
	try {
		return decryptWith(deriveKey('settings v1'), value);
	} catch (error) {
		const previous = previousKey();
		if (!previous) throw error;
		return decryptWith(derive(previous, 'settings v1', 32), value);
	}
}

export function encryptedWithCurrentKey(value: string) {
	try {
		decryptWith(deriveKey('settings v1'), value);
		return true;
	} catch {
		return false;
	}
}

export function sha256(value: string | Buffer) {
	return createHash('sha256').update(value).digest('hex');
}

export function hmacWith(key: Buffer, value: string) {
	return createHmac('sha256', key).update(value).digest('hex');
}

export function randomToken(bytes = 32) {
	return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}
