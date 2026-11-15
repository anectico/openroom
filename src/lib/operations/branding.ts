import { z } from 'zod';
import { BrandImageError, brandingFor, setInstallLogo, storeBrandImage } from '../server/branding.ts';
import { database } from '../server/db/index.ts';
import { releaseObject } from '../server/rooms.ts';
import { setSetting } from '../server/settings.ts';
import { defineOperation, OpError } from './define.ts';
import { authorize } from './execute.ts';
import { loadRoom, writableRoom } from './rooms.ts';

const color = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1f6feb.')
	.nullable();

const branding = z.object({
	coverUrl: z.string().nullable(),
	logoUrl: z.string().nullable(),
	accentColor: z.string().nullable(),
	roomOverrides: z.object({ logo: z.boolean(), accentColor: z.boolean() }).nullable(),
	workspace: z.object({
		logoUrl: z.string().nullable(),
		accentColor: z.string().nullable(),
	}),
});

function present(roomId: string | undefined): z.input<typeof branding> {
	if (!roomId) {
		const b = brandingFor(null);
		return { ...b, roomOverrides: null, workspace: b };
	}
	const r = loadRoom(roomId);
	return {
		workspace: brandingFor(null),
		...brandingFor(r),
		roomOverrides: { logo: !!r.logo_object_key, accentColor: !!r.accent_color },
	};
}

export const getBranding = defineOperation({
	name: 'get_branding',
	summary:
		'Show the install’s branding, or a room’s (its own logo and colour, falling back to the install’s).',
	role: 'observer',
	http: { method: 'GET', path: '/branding' },
	input: z.object({ roomId: z.string().optional() }),
	output: branding,
	audit: false,
	run: (input) => present(input.roomId),
});

export const updateBranding = defineOperation({
	name: 'update_branding',
	summary:
		'Save branding and room appearance together, including the optional room cover. Workspace branding requires the owner role. Omitted fields stay unchanged; null logo/colour restores inheritance. The logo also supplies the investor favicon.',
	role: 'admin',
	http: { method: 'PATCH', path: '/branding' },
	input: z.object({
		roomId: z.string().optional(),
		accentColor: color.optional(),
		imageBase64: z.string().max(1_000_000).nullable().optional(),
		coverBase64: z
			.string()
			.max(1_000_000)
			.nullable()
			.optional()
			.describe('Room cover artwork as PNG, JPEG or WebP up to 700 KB. null removes it.'),
		name: z.string().trim().min(1).max(120).optional(),
		welcomeMarkdown: z.string().max(20_000).optional(),
	}),
	output: branding,
	audit: {
		target: (i) => ({
			type: i.roomId ? 'room' : 'settings',
			id: i.roomId ?? 'branding',
			roomId: i.roomId ?? null,
		}),
		detail: (i) => ({ fields: Object.keys(i).filter((k) => k !== 'roomId') }),
	},
	run: async (input, ctx) => {
		if (
			!input.roomId &&
			(input.name !== undefined || input.welcomeMarkdown !== undefined || input.coverBase64 !== undefined)
		)
			throw new OpError(400, 'room_only', 'Cover, name and welcome text belong to a room.');
		authorize(ctx, input.roomId ? 'admin' : 'owner');
		if (input.roomId) writableRoom(input.roomId);
		let key: string | null = null;
		if (input.imageBase64 !== undefined && input.imageBase64 !== null) {
			try {
				key = await storeBrandImage(input.imageBase64, 'logo');
			} catch (e) {
				if (e instanceof BrandImageError) throw new OpError(400, 'bad_logo', e.message);
				throw e;
			}
		}
		let cover: string | null = null;
		try {
			if (input.coverBase64 != null) cover = await storeBrandImage(input.coverBase64, 'cover');
			database()
				.sqlite.transaction(() => {
					authorize(ctx, input.roomId ? 'admin' : 'owner');
					if (input.roomId) {
						const r = writableRoom(input.roomId);
						database()
							.sqlite.prepare(
								'UPDATE rooms SET name = ?, welcome_markdown = ?, accent_color = ?, logo_object_key = ?, cover_object_key = ? WHERE id = ?',
							)
							.run(
								input.name ?? r.name,
								input.welcomeMarkdown ?? r.welcome_markdown,
								input.accentColor === undefined ? r.accent_color : input.accentColor,
								input.imageBase64 === undefined ? r.logo_object_key : key,
								input.coverBase64 === undefined ? r.cover_object_key : cover,
								r.id,
							);
						if (input.coverBase64 !== undefined && r.cover_object_key) releaseObject(r.cover_object_key);
						if (input.imageBase64 !== undefined && r.logo_object_key) releaseObject(r.logo_object_key);
					} else {
						if (input.accentColor !== undefined) setSetting('branding.accent_color', input.accentColor);
						if (input.imageBase64 !== undefined) setInstallLogo(key);
					}
				})
				.immediate();
		} catch (error) {
			if (key) releaseObject(key);
			if (cover) releaseObject(cover);
			if (error instanceof BrandImageError) throw new OpError(400, 'bad_cover', error.message);
			throw error;
		}
		return present(input.roomId);
	},
});

export const setLogo = defineOperation({
	name: 'set_logo',
	summary:
		'Set the logo of the install or one room from a PNG, JPEG or WebP image (base64, under 700 KB); it is re-encoded and shrunk to 512 px. null removes it. SVG is refused.',
	role: 'admin',
	http: { method: 'PUT', path: '/branding/logo' },
	input: z.object({ roomId: z.string().optional(), imageBase64: z.string().max(1_000_000).nullable() }),
	output: branding,
	audit: {
		target: (i) => ({
			type: i.roomId ? 'room' : 'settings',
			id: i.roomId ?? 'branding',
			roomId: i.roomId ?? null,
		}),
		detail: (i) => ({ removed: i.imageBase64 === null }),
	},
	run: async (input, ctx) => {
		if (!input.roomId && ctx.actor.role !== 'owner')
			throw new OpError(403, 'forbidden', 'Install branding needs the owner role.');
		const room = input.roomId ? writableRoom(input.roomId) : null;
		let key: string | null = null;
		if (input.imageBase64) {
			try {
				key = await storeBrandImage(input.imageBase64, 'logo');
			} catch (e) {
				if (e instanceof BrandImageError) throw new OpError(400, 'bad_logo', e.message);
				throw e;
			}
		}
		try {
			database()
				.sqlite.transaction(() => {
					authorize(ctx, room ? 'admin' : 'owner');
					if (room) {
						const latest = writableRoom(room.id);
						database()
							.sqlite.prepare('UPDATE rooms SET logo_object_key = ? WHERE id = ?')
							.run(key, latest.id);
						if (latest.logo_object_key) releaseObject(latest.logo_object_key);
					} else setInstallLogo(key);
				})
				.immediate();
		} catch (error) {
			if (key) releaseObject(key);
			throw error;
		}
		return present(input.roomId);
	},
});
