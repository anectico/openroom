import { z } from 'zod';
import { brandingFor, LogoError, setInstallLogo, storeLogo } from '../server/branding.ts';
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
	logoUrl: z.string().nullable(),
	accentColor: z.string().nullable(),
	whiteLabel: z
		.boolean()
		.describe('Hides “Powered by OpenRoom” on investor pages; admin pages keep “OpenRoom by Anectico”.'),
	roomOverrides: z.object({ logo: z.boolean(), accentColor: z.boolean() }).nullable(),
	workspace: z.object({
		logoUrl: z.string().nullable(),
		accentColor: z.string().nullable(),
		whiteLabel: z.boolean(),
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
		'Save appearance together: logo, colour, and room name/welcome Markdown; workspace white-labelling needs the owner role. Omitted fields stay unchanged; null logo/colour restores inheritance. The logo also supplies the investor favicon.',
	role: 'admin',
	http: { method: 'PATCH', path: '/branding' },
	input: z.object({
		roomId: z.string().optional(),
		accentColor: color.optional(),
		whiteLabel: z.boolean().optional(),
		imageBase64: z.string().max(1_000_000).nullable().optional(),
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
		if (input.roomId && input.whiteLabel !== undefined)
			throw new OpError(400, 'install_only', 'White-labelling is set for the whole install.');
		if (!input.roomId && (input.name !== undefined || input.welcomeMarkdown !== undefined))
			throw new OpError(400, 'room_only', 'Name and welcome text belong to a room.');
		authorize(ctx, input.roomId ? 'admin' : 'owner');
		if (input.roomId) writableRoom(input.roomId);
		let key: string | null = null;
		if (input.imageBase64 !== undefined && input.imageBase64 !== null) {
			try {
				key = await storeLogo(input.imageBase64);
			} catch (e) {
				if (e instanceof LogoError) throw new OpError(400, 'bad_logo', e.message);
				throw e;
			}
		}
		try {
			database()
				.sqlite.transaction(() => {
					authorize(ctx, input.roomId ? 'admin' : 'owner');
					if (input.roomId) {
						const r = writableRoom(input.roomId);
						database()
							.sqlite.prepare(
								'UPDATE rooms SET name = ?, welcome_markdown = ?, accent_color = ?, logo_object_key = ? WHERE id = ?',
							)
							.run(
								input.name ?? r.name,
								input.welcomeMarkdown ?? r.welcome_markdown,
								input.accentColor === undefined ? r.accent_color : input.accentColor,
								input.imageBase64 === undefined ? r.logo_object_key : key,
								r.id,
							);
						if (input.imageBase64 !== undefined && r.logo_object_key) releaseObject(r.logo_object_key);
					} else {
						if (input.accentColor !== undefined) setSetting('branding.accent_color', input.accentColor);
						if (input.whiteLabel !== undefined)
							setSetting('branding.white_label', input.whiteLabel ? '1' : null);
						if (input.imageBase64 !== undefined) setInstallLogo(key);
					}
				})
				.immediate();
		} catch (error) {
			if (key) releaseObject(key);
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
				key = await storeLogo(input.imageBase64);
			} catch (e) {
				if (e instanceof LogoError) throw new OpError(400, 'bad_logo', e.message);
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
