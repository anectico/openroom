import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { defaultLinkSettings, type LinkSettings, linkSettings } from '../schemas/link-settings.ts';
import { personalWelcome } from '../schemas/personalization.ts';
import { blockValue, type Entry, parseEntries } from '../server/access.ts';
import { database } from '../server/db/index.ts';
import { emailReady, sendEmail } from '../server/email.ts';
import { emailCopy } from '../server/email-copy.ts';
import { newId } from '../server/ids.ts';
import { findMember } from '../server/members.ts';
import { publicOrigin } from '../server/origin.ts';
import type { RoomRow } from '../server/rooms.ts';
import { decrypt, encrypt, randomToken, sha256 } from '../server/secrets.ts';
import { createSession } from '../server/viewer/access.ts';
import { confirmField, defineOperation, notFound, OpError } from './define.ts';
import { authorize } from './execute.ts';
import { loadRoom, writableRoom } from './rooms.ts';

type LinkRow = {
	id: string;
	room_id: string;
	token_enc: string;
	open: number;
	label: string;
	welcome_markdown: string | null;
	password_hash: string | null;
	settings_json: string;
	invited_at: number | null;
	expires_at: number | null;
	revoked_at: number | null;
	created_at: number;
};

const overrides = linkSettings.partial();

const entryOut = z.object({ id: z.string(), kind: z.enum(['email', 'domain']), value: z.string() });

const link = z.object({
	id: z.string(),
	roomId: z.string(),
	label: z.string(),
	welcomeMarkdown: z
		.string()
		.nullable()
		.describe('Personal welcome shown after access checks, or null to use the room introduction.'),
	url: z.string().describe('The link address. Anyone with it can reach the link’s gates.'),
	status: z.enum(['active', 'expired', 'revoked']),
	open: z.boolean().describe('Any email may enter; the allow list is not used.'),
	allow: z.array(entryOut),
	blocks: z.array(entryOut),
	hasPassword: z.boolean(),
	expiresAt: z.number().nullable(),
	revokedAt: z.number().nullable(),
	invitedAt: z.number().nullable(),
	createdAt: z.number(),
	settings: linkSettings.describe('The settings in effect: room defaults with this link’s overrides.'),
	overridden: z.array(z.string()).describe('Settings this link overrides instead of following the room.'),
	groupId: z.string().nullable().describe('The viewer group; null means the link sees the whole room.'),
	groupName: z.string().nullable(),
	lastOpenedAt: z.number().nullable(),
	viewerCount: z.number(),
});

const entries = z
	.array(z.string().max(320))
	.max(1000)
	.describe('Emails (ana@fund.com) or domains (fund.com, which also matches its subdomains).');

const editable = {
	label: z.string().trim().min(1).max(120),
	open: z.boolean(),
	allow: entries,
	blocks: entries,
	password: z.string().min(8).max(200).nullable().describe('null removes the password.'),
	expiresAt: z.number().int().nullable().describe('Unix time in ms; null for no expiry.'),
	settings: overrides.describe('Settings to override; others follow the room defaults.'),
	groupId: z.string().nullable().describe('A viewer group of the room, or null for the whole room.'),
	resetSettings: z.array(z.string()).optional().describe('Setting names to stop overriding.'),
};

function sqlite() {
	return database().sqlite;
}

function loadLink(id: string) {
	const row = sqlite().prepare('SELECT * FROM links WHERE id = ?').get(id) as LinkRow | undefined;
	if (!row) throw notFound('Link');
	return row;
}

function roomDefaults(room: RoomRow): LinkSettings {
	return { ...defaultLinkSettings, ...JSON.parse(room.defaults_json) };
}

function checkNda(room: RoomRow, settings: LinkSettings) {
	if (settings.requireNda && !room.current_nda_version_id)
		throw new OpError(400, 'no_nda', 'Add the room’s NDA text before asking investors to accept it.');
}

function parsed(raw: string[], what: string) {
	const { entries: list, invalid } = parseEntries(raw);
	if (invalid.length)
		throw new OpError(
			400,
			'invalid_entries',
			`These ${what} entries are not emails or domains: ${invalid.join(', ')}`,
			{
				invalid,
			},
		);
	return list;
}

function writeEntries(linkId: string, allow: Entry[] | undefined, blocks: Entry[] | undefined) {
	const db = sqlite();
	if (allow) {
		db.prepare('DELETE FROM link_allow WHERE link_id = ?').run(linkId);
		const insert = db.prepare('INSERT INTO link_allow (id, link_id, kind, value) VALUES (?, ?, ?, ?)');
		for (const e of allow) insert.run(newId('alw'), linkId, e.kind, e.value);
	}
	if (blocks) {
		db.prepare('DELETE FROM blocks WHERE link_id = ?').run(linkId);
		const insert = db.prepare(
			'INSERT INTO blocks (id, link_id, kind, value, display, created_at) VALUES (?, ?, ?, ?, ?, ?)',
		);
		for (const e of blocks) insert.run(newId('blk'), linkId, e.kind, blockValue(e), e.value, Date.now());
	}
}

function statusOf(row: LinkRow) {
	if (row.revoked_at !== null) return 'revoked' as const;
	if (row.expires_at !== null && row.expires_at <= Date.now()) return 'expired' as const;
	return 'active' as const;
}

function present(row: LinkRow): z.input<typeof link> {
	const room = loadRoom(row.room_id);
	const own = JSON.parse(row.settings_json) as Partial<LinkSettings>;
	const allow = sqlite()
		.prepare('SELECT id, kind, value FROM link_allow WHERE link_id = ? ORDER BY kind, value')
		.all(row.id) as z.input<typeof entryOut>[];
	const blocks = (
		sqlite()
			.prepare('SELECT id, kind, display FROM blocks WHERE link_id = ? ORDER BY kind, display')
			.all(row.id) as { id: string; kind: 'email' | 'domain'; display: string | null }[]
	).map((b) => ({ id: b.id, kind: b.kind, value: b.display ?? 'Erased investor' }));
	return {
		id: row.id,
		roomId: row.room_id,
		label: row.label,
		welcomeMarkdown: row.welcome_markdown,
		url: `${publicOrigin()}/r/${decrypt(row.token_enc)}`,
		status: statusOf(row),
		open: !!row.open,
		allow,
		blocks,
		hasPassword: row.password_hash !== null,
		expiresAt: row.expires_at,
		revokedAt: row.revoked_at,
		invitedAt: row.invited_at,
		createdAt: row.created_at,
		settings: { ...roomDefaults(room), ...own },
		overridden: Object.keys(own),
		...linkStats(row.id),
	};
}

function linkStats(linkId: string) {
	const g = sqlite()
		.prepare(
			'SELECT g.id, g.name FROM link_groups lg JOIN groups g ON g.id = lg.group_id WHERE lg.link_id = ?',
		)
		.get(linkId) as { id: string; name: string } | undefined;
	const s = sqlite()
		.prepare(
			'SELECT max(last_seen_at) AS last, count(DISTINCT viewer_id) AS n FROM viewer_sessions WHERE link_id = ? AND preview_by IS NULL',
		)
		.get(linkId) as { last: number | null; n: number };
	return { groupId: g?.id ?? null, groupName: g?.name ?? null, lastOpenedAt: s.last, viewerCount: s.n };
}

function setGroup(linkId: string, roomId: string, groupId: string | null | undefined) {
	if (groupId === undefined) return;
	sqlite().prepare('DELETE FROM link_groups WHERE link_id = ?').run(linkId);
	if (groupId === null) return;
	const g = sqlite().prepare('SELECT room_id FROM groups WHERE id = ?').get(groupId) as
		| { room_id: string }
		| undefined;
	if (g?.room_id !== roomId) throw new OpError(400, 'wrong_room', 'That group is not in this link’s room.');
	sqlite().prepare('INSERT INTO link_groups (link_id, group_id) VALUES (?, ?)').run(linkId, groupId);
}

function newToken() {
	const token = randomToken(32);
	return { hash: sha256(token), enc: encrypt(token) };
}

function futureOrNull(expiresAt: number | null | undefined) {
	if (expiresAt && expiresAt <= Date.now())
		throw new OpError(400, 'expiry_past', 'The expiry must be in the future.');
	return expiresAt ?? null;
}

export const listLinks = defineOperation({
	name: 'list_links',
	summary: 'List a room’s links with their addresses. Revoked and expired ones only with includeInactive.',
	role: 'admin',
	http: { method: 'GET', path: '/rooms/{roomId}/links' },
	input: z.object({ roomId: z.string(), includeInactive: z.union([z.boolean(), z.stringbool()]).optional() }),
	output: z.object({ links: z.array(link) }),
	audit: false,
	run: (input) => {
		loadRoom(input.roomId);
		const rows = sqlite()
			.prepare('SELECT * FROM links WHERE room_id = ? ORDER BY created_at DESC')
			.all(input.roomId) as LinkRow[];
		return {
			links: rows.filter((r) => input.includeInactive || statusOf(r) === 'active').map(present),
		};
	},
});

export const getLink = defineOperation({
	name: 'get_link',
	summary: 'Show one link with its address, lists and settings in effect.',
	role: 'admin',
	http: { method: 'GET', path: '/links/{linkId}' },
	input: z.object({ linkId: z.string() }),
	output: link,
	audit: false,
	run: (input) => present(loadLink(input.linkId)),
});

export const createLink = defineOperation({
	name: 'create_link',
	summary:
		'Create a link to a room. Give an allow list of emails and domains, or open: true for any email. Settings start from the room defaults. Optional welcomeMarkdown is shown only after access checks, to everyone using this link; null uses the room introduction.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms/{roomId}/links' },
	input: z.object({
		roomId: z.string(),
		welcomeMarkdown: personalWelcome.default(null),
		label: editable.label.describe('Who the link is for, such as “Fund X partners”.'),
		open: editable.open.default(false),
		allow: editable.allow.default([]),
		blocks: editable.blocks.default([]),
		password: editable.password.optional(),
		expiresAt: editable.expiresAt.optional(),
		settings: editable.settings.default({}),
		groupId: editable.groupId.optional(),
	}),
	output: link,
	audit: {
		target: (_i, o) => ({ type: 'link', id: o.id, roomId: o.roomId }),
		detail: (i) => ({
			open: i.open,
			allowCount: i.allow.length,
			blockCount: i.blocks.length,
			personalWelcome: i.welcomeMarkdown !== null,
		}),
	},
	run: async (input, ctx) => {
		const room = writableRoom(input.roomId);
		const allow = parsed(input.allow, 'allow');
		const blocks = parsed(input.blocks, 'block');
		if (!input.open && !allow.length)
			throw new OpError(
				400,
				'no_allow_list',
				'Add emails or domains to the allow list, or make the link open.',
			);
		checkNda(room, { ...roomDefaults(room), ...input.settings });
		const expiresAt = futureOrNull(input.expiresAt);
		const passwordHash = input.password ? await hashPassword(input.password) : null;
		authorize(ctx, 'admin');
		writableRoom(room.id);
		const id = newId('lnk');
		const token = newToken();
		const db = sqlite();
		db.transaction(() => {
			db.prepare(
				`INSERT INTO links (id, room_id, token_hash, token_enc, open, label, welcome_markdown, password_hash, settings_json, expires_at, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				id,
				room.id,
				token.hash,
				token.enc,
				input.open ? 1 : 0,
				input.label,
				input.welcomeMarkdown,
				passwordHash,
				JSON.stringify(input.settings),
				expiresAt,
				Date.now(),
			);
			writeEntries(id, allow, blocks);
			setGroup(id, room.id, input.groupId);
		}).immediate();
		return present(loadLink(id));
	},
});

export const updateLink = defineOperation({
	name: 'update_link',
	summary:
		'Change a link: label, open, allow or block list (each replaced as a whole), password, expiry, personal welcome or setting overrides. Omit welcomeMarkdown to preserve it; null restores the room introduction. Open sessions follow at once.',
	role: 'admin',
	http: { method: 'PATCH', path: '/links/{linkId}' },
	input: z.object({
		linkId: z.string(),
		label: editable.label.optional(),
		welcomeMarkdown: personalWelcome.optional(),
		open: editable.open.optional(),
		allow: editable.allow.optional(),
		blocks: editable.blocks.optional(),
		password: editable.password.optional(),
		expiresAt: editable.expiresAt.optional(),
		settings: editable.settings.optional(),
		groupId: editable.groupId.optional(),
		resetSettings: editable.resetSettings,
	}),
	output: link,
	audit: {
		target: (_i, o) => ({ type: 'link', id: o.id, roomId: o.roomId }),
		detail: (i) => ({ fields: Object.keys(i).filter((k) => k !== 'linkId') }),
	},
	run: async (input, ctx) => {
		const row = loadLink(input.linkId);
		const room = writableRoom(row.room_id);
		if (row.revoked_at !== null)
			throw new OpError(409, 'revoked', 'This link is revoked and cannot change. Create a new link instead.');
		const allow = input.allow && parsed(input.allow, 'allow');
		const blocks = input.blocks && parsed(input.blocks, 'block');
		const open = input.open ?? !!row.open;
		const allowCount =
			allow?.length ??
			(
				sqlite().prepare('SELECT count(*) AS n FROM link_allow WHERE link_id = ?').get(row.id) as {
					n: number;
				}
			).n;
		if (!open && !allowCount)
			throw new OpError(
				400,
				'no_allow_list',
				'Add emails or domains to the allow list, or make the link open.',
			);
		const own: Record<string, unknown> = { ...JSON.parse(row.settings_json), ...input.settings };
		for (const k of input.resetSettings ?? []) delete own[k];
		const own2 = overrides.parse(own);
		checkNda(room, { ...roomDefaults(room), ...own2 });
		const expiresAt = input.expiresAt === undefined ? row.expires_at : futureOrNull(input.expiresAt);
		const passwordHash =
			input.password === undefined
				? row.password_hash
				: input.password === null
					? null
					: await hashPassword(input.password);
		const db = sqlite();
		db.transaction(() => {
			authorize(ctx, 'admin');
			writableRoom(room.id);
			const current = loadLink(row.id);
			if (current.revoked_at !== null || JSON.stringify(current) !== JSON.stringify(row))
				throw new OpError(409, 'link_changed', 'The link changed. Reload it and try again.');
			db.prepare(
				'UPDATE links SET label = ?, open = ?, password_hash = ?, settings_json = ?, expires_at = ?, welcome_markdown = ? WHERE id = ?',
			).run(
				input.label ?? row.label,
				open ? 1 : 0,
				passwordHash,
				JSON.stringify(own2),
				expiresAt,
				input.welcomeMarkdown === undefined ? row.welcome_markdown : input.welcomeMarkdown,
				row.id,
			);
			if (input.password !== undefined) {
				db.prepare(
					'UPDATE viewer_sessions SET ended_at = ? WHERE link_id = ? AND preview_by IS NULL AND ended_at IS NULL',
				).run(Date.now(), row.id);
				db.prepare('UPDATE gate_progress SET password_ok = 0 WHERE link_id = ?').run(row.id);
			}
			writeEntries(row.id, allow, blocks);
			setGroup(row.id, room.id, input.groupId);
		}).immediate();
		return present(loadLink(row.id));
	},
});

export const revokeLink = defineOperation({
	name: 'revoke_link',
	summary: 'Revoke a link for good: its address stops working and open sessions end at once.',
	role: 'admin',
	http: { method: 'POST', path: '/links/{linkId}/revoke' },
	input: z.object({ linkId: z.string() }),
	output: link,
	audit: { target: (_i, o) => ({ type: 'link', id: o.id, roomId: o.roomId }) },
	run: (input) => {
		const row = loadLink(input.linkId);
		sqlite()
			.prepare('UPDATE links SET revoked_at = coalesce(revoked_at, ?) WHERE id = ?')
			.run(Date.now(), row.id);
		return present(loadLink(row.id));
	},
});

export const revokeAllLinks = defineOperation({
	name: 'revoke_all_links',
	summary: 'Revoke every link of a room at once; every investor loses access.',
	role: 'admin',
	http: { method: 'POST', path: '/rooms/{roomId}/links/revoke-all' },
	input: z.object({ roomId: z.string(), ...confirmField }),
	output: z.object({ revoked: z.number() }),
	destructive: (input) => {
		const room = loadRoom(input.roomId);
		const n = (
			sqlite()
				.prepare('SELECT count(*) AS n FROM links WHERE room_id = ? AND revoked_at IS NULL')
				.get(room.id) as {
				n: number;
			}
		).n;
		return `This revokes all ${n} link(s) of “${room.name}”; every investor loses access at once and it cannot be undone.`;
	},
	audit: {
		target: (i) => ({ type: 'room', id: i.roomId, roomId: i.roomId }),
		detail: (_i, o) => ({ revoked: o.revoked }),
	},
	run: (input) => {
		const room = loadRoom(input.roomId);
		const result = sqlite()
			.prepare('UPDATE links SET revoked_at = ? WHERE room_id = ? AND revoked_at IS NULL')
			.run(Date.now(), room.id);
		return { revoked: result.changes };
	},
});

export const newLinkAddress = defineOperation({
	name: 'new_link_address',
	summary: 'Give a link a new address; the old one stops working. Settings, lists and history stay.',
	role: 'admin',
	http: { method: 'POST', path: '/links/{linkId}/new-address' },
	input: z.object({ linkId: z.string() }),
	output: link,
	audit: { target: (_i, o) => ({ type: 'link', id: o.id, roomId: o.roomId }) },
	run: (input) => {
		const row = loadLink(input.linkId);
		writableRoom(row.room_id);
		if (row.revoked_at !== null)
			throw new OpError(409, 'revoked', 'This link is revoked. Create a new link instead.');
		const token = newToken();
		sqlite()
			.prepare('UPDATE links SET token_hash = ?, token_enc = ? WHERE id = ?')
			.run(token.hash, token.enc, row.id);
		return present(loadLink(row.id));
	},
});

export const updateLinkDefaults = defineOperation({
	name: 'update_link_defaults',
	summary: 'Change a room’s link defaults. Links that do not override a setting follow the change at once.',
	role: 'admin',
	http: { method: 'PATCH', path: '/rooms/{roomId}/link-defaults' },
	input: z.object({ roomId: z.string(), settings: overrides }),
	output: z.object({ roomId: z.string(), linkDefaults: linkSettings }),
	audit: {
		target: (i) => ({ type: 'room', id: i.roomId, roomId: i.roomId }),
		detail: (i) => ({ fields: Object.keys(i.settings) }),
	},
	run: (input) => {
		const room = writableRoom(input.roomId);
		const next = linkSettings.parse({ ...roomDefaults(room), ...input.settings });
		checkNda(room, next);
		sqlite().prepare('UPDATE rooms SET defaults_json = ? WHERE id = ?').run(JSON.stringify(next), room.id);
		return { roomId: room.id, linkDefaults: next };
	},
});

export const previewLink = defineOperation({
	name: 'preview_link',
	summary:
		'Make a one-hour preview address that shows the room exactly as this link sees it (its group and settings), without its gates. Nothing is recorded.',
	role: 'admin',
	http: { method: 'POST', path: '/links/{linkId}/preview' },
	input: z.object({ linkId: z.string() }),
	output: z.object({ url: z.string(), expiresAt: z.number() }),
	audit: { target: (i) => ({ type: 'link', id: i.linkId }) },
	run: (input, ctx) => {
		const row = loadLink(input.linkId);
		if (statusOf(row) !== 'active')
			throw new OpError(409, 'inactive', 'Only an active link can be previewed.');
		const session = createSession({
			linkId: row.id,
			viewerId: null,
			previewBy: ctx.actor.userId,
			verified: false,
			fields: null,
			ndaVersionId: null,
			ip: ctx.ip,
			userAgent: null,
			ttlMs: 60 * 60_000,
		});
		return { url: `${publicOrigin()}/v/${row.id}/preview/${session.token}`, expiresAt: session.expiresAt };
	},
});

export const sendLinkInvites = defineOperation({
	name: 'send_link_invites',
	summary:
		'Email the link to the individual emails on its allow list (domains are skipped). Needs email. Give emails to send to only some of them.',
	role: 'admin',
	http: { method: 'POST', path: '/links/{linkId}/invites' },
	input: z.object({ linkId: z.string(), emails: z.array(z.string()).max(1000).optional() }),
	output: z.object({ sent: z.number(), skipped: z.array(z.string()) }),
	audit: {
		target: (i) => ({ type: 'link', id: i.linkId }),
		detail: (_i, o) => ({ sent: o.sent, skipped: o.skipped.length }),
	},
	run: (input, ctx) => {
		if (!emailReady())
			throw new OpError(409, 'email_not_set_up', 'Set up email first, or copy the invite text instead.');
		const row = loadLink(input.linkId);
		if (statusOf(row) !== 'active') throw new OpError(409, 'inactive', 'Only an active link can be sent.');
		const room = loadRoom(row.room_id);
		const listed = (
			sqlite().prepare("SELECT value FROM link_allow WHERE link_id = ? AND kind = 'email'").all(row.id) as {
				value: string;
			}[]
		).map((r) => r.value);
		const wanted = input.emails ? new Set(input.emails.map((e) => e.trim().toLowerCase())) : null;
		const targets = listed.filter((e) => !wanted || wanted.has(e));
		const skipped = input.emails ? input.emails.filter((e) => !listed.includes(e.trim().toLowerCase())) : [];
		const member = findMember(ctx.actor.userId);
		const url = `${publicOrigin()}/r/${decrypt(row.token_enc)}`;
		let sent = 0;
		for (const email of targets) {
			try {
				sendEmail(
					email,
					emailCopy.investorInvite({ room: room.name, url, from: member?.name || 'The team' }),
				);
				sent++;
			} catch {
				skipped.push(email);
			}
		}
		if (sent) sqlite().prepare('UPDATE links SET invited_at = ? WHERE id = ?').run(Date.now(), row.id);
		return { sent, skipped };
	},
});
