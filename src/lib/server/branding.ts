import { Readable } from 'node:stream';
import sharp from 'sharp';
import { database } from './db/index.ts';
import { releaseObject } from './rooms.ts';
import { sha256 } from './secrets.ts';
import { getSetting, setSetting } from './settings.ts';
import { newObjectKey, writeLocation, writeObject } from './storage.ts';

export class BrandImageError extends Error {}

const sqlite = () => database().sqlite;
const maxImageBytes = 700 * 1024;

export function installBranding() {
	return {
		logoKey: getSetting('branding.logo_key'),
		accentColor: getSetting('branding.accent_color'),
	};
}

export function brandingFor(
	room: {
		logo_object_key: string | null;
		accent_color: string | null;
		cover_object_key?: string | null;
	} | null,
) {
	const install = installBranding();
	return {
		coverUrl: room?.cover_object_key ? `/b/cover/${encodeURIComponent(room.cover_object_key)}` : null,
		logoUrl: room?.logo_object_key
			? `/b/logo/${encodeURIComponent(room.logo_object_key)}`
			: install.logoKey
				? `/b/logo/${encodeURIComponent(install.logoKey)}`
				: null,
		accentColor: room?.accent_color ?? install.accentColor,
	};
}

export async function storeBrandImage(base64: string, kind: 'logo' | 'cover') {
	const raw = Buffer.from(base64, 'base64');
	if (!raw.length) throw new BrandImageError(`The ${kind} is empty.`);
	if (raw.length > maxImageBytes) throw new BrandImageError(`The ${kind} must be smaller than 700 KB.`);
	let bytes: Buffer;
	try {
		const image = sharp(raw, { limitInputPixels: 40_000_000, failOn: 'error' });
		const meta = await image.metadata();
		if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format))
			throw new BrandImageError('Use a PNG, JPEG or WebP image. SVG and other formats are not accepted.');
		bytes =
			kind === 'cover'
				? await image
						.rotate()
						.resize(1440, 720, { fit: 'inside', withoutEnlargement: true })
						.webp({ quality: 84 })
						.toBuffer()
				: await image
						.rotate()
						.resize(512, 512, { fit: 'inside', withoutEnlargement: true })
						.png({ compressionLevel: 9 })
						.toBuffer();
	} catch (e) {
		if (e instanceof BrandImageError) throw e;
		throw new BrandImageError('That file is not an image OpenRoom can read.');
	}
	const key = newObjectKey();
	const location = writeLocation();
	await writeObject(key, Readable.from(bytes), bytes.length, location);
	sqlite()
		.prepare(
			'INSERT INTO objects (key, location, size, sha256, refcount, created_at) VALUES (?, ?, ?, ?, 1, ?)',
		)
		.run(key, location, bytes.length, sha256(bytes), Date.now());
	return key;
}

export function setInstallLogo(key: string | null) {
	const old = getSetting('branding.logo_key');
	setSetting('branding.logo_key', key);
	if (old) releaseObject(old);
}

export function isLogoKey(key: string) {
	if (getSetting('branding.logo_key') === key) return true;
	return !!sqlite().prepare('SELECT 1 FROM rooms WHERE logo_object_key = ?').get(key);
}
