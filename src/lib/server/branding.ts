import { Readable } from 'node:stream';
import sharp from 'sharp';
import { database } from './db/index.ts';
import { releaseObject } from './rooms.ts';
import { sha256 } from './secrets.ts';
import { getSetting, setSetting } from './settings.ts';
import { newObjectKey, writeLocation, writeObject } from './storage.ts';

export class LogoError extends Error {}

const sqlite = () => database().sqlite;
export const maxLogoBytes = 700 * 1024;

export function installBranding() {
	return {
		logoKey: getSetting('branding.logo_key'),
		accentColor: getSetting('branding.accent_color'),
		whiteLabel: getSetting('branding.white_label') === '1',
	};
}

export function brandingFor(room: { logo_object_key: string | null; accent_color: string | null } | null) {
	const install = installBranding();
	return {
		logoUrl: room?.logo_object_key
			? `/b/logo/${encodeURIComponent(room.logo_object_key)}`
			: install.logoKey
				? `/b/logo/${encodeURIComponent(install.logoKey)}`
				: null,
		accentColor: room?.accent_color ?? install.accentColor,
		whiteLabel: install.whiteLabel,
	};
}

export async function storeLogo(base64: string) {
	const raw = Buffer.from(base64, 'base64');
	if (!raw.length) throw new LogoError('The logo is empty.');
	if (raw.length > maxLogoBytes) throw new LogoError('The logo must be smaller than 700 KB.');
	let image: ReturnType<typeof sharp>;
	try {
		image = sharp(raw, { limitInputPixels: 40_000_000, failOn: 'error' });
		const meta = await image.metadata();
		if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format))
			throw new LogoError('Use a PNG, JPEG or WebP image. SVG and other formats are not accepted.');
	} catch (e) {
		if (e instanceof LogoError) throw e;
		throw new LogoError('That file is not an image OpenRoom can read.');
	}
	const png = await image
		.rotate()
		.resize(512, 512, { fit: 'inside', withoutEnlargement: true })
		.png({ compressionLevel: 9 })
		.toBuffer();
	const key = newObjectKey();
	const location = writeLocation();
	await writeObject(key, Readable.from(png), png.length, location);
	sqlite()
		.prepare(
			'INSERT INTO objects (key, location, size, sha256, refcount, created_at) VALUES (?, ?, ?, ?, 1, ?)',
		)
		.run(key, location, png.length, sha256(png), Date.now());
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
