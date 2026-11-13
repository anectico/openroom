import { defaultLinkSettings, type LinkSettings } from '../../schemas/link-settings.ts';
import { database } from '../db/index.ts';
import { domainMatches } from '../emails.ts';
import { newId } from '../ids.ts';
import { findRoom, type RoomRow, roomTree, type TreeNode } from '../rooms.ts';
import { randomToken, sha256 } from '../secrets.ts';
import { hmac } from '../settings.ts';

export type LinkRow = {
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

export type SessionRow = {
	id: string;
	link_id: string;
	viewer_id: string | null;
	preview_by: string | null;
	verified: number;
	nda_version_id: string | null;
	fields_json: string | null;
	last_seen_at: number;
	created_at: number;
	expires_at: number;
};

export const sessionDays = 7;
export const sessionCookie = (linkId: string) => `ov_${linkId}`;

const sqlite = () => database().sqlite;

export function linkActive(link: LinkRow | undefined, now = Date.now()) {
	return !!link && link.revoked_at === null && (link.expires_at === null || link.expires_at > now);
}

export function linkByToken(token: string) {
	if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return undefined;
	const link = sqlite().prepare('SELECT * FROM links WHERE token_hash = ?').get(sha256(token)) as
		| LinkRow
		| undefined;
	return linkActive(link) ? link : undefined;
}

export function linkById(id: string) {
	return sqlite().prepare('SELECT * FROM links WHERE id = ?').get(id) as LinkRow | undefined;
}

export function effectiveSettings(link: LinkRow, room: RoomRow): LinkSettings {
	const s: LinkSettings = {
		...defaultLinkSettings,
		...JSON.parse(room.defaults_json),
		...JSON.parse(link.settings_json),
	};
	if (s.requireNda && !room.current_nda_version_id) s.requireNda = false;
	return s;
}

function domainSuffixes(domain: string) {
	const parts = domain.split('.');
	return parts.slice(0, -1).map((_, i) => parts.slice(i).join('.'));
}

export function emailAllowed(link: LinkRow, email: string) {
	if (link.open) return true;
	const domain = email.slice(email.lastIndexOf('@') + 1);
	const rows = sqlite().prepare('SELECT kind, value FROM link_allow WHERE link_id = ?').all(link.id) as {
		kind: 'email' | 'domain';
		value: string;
	}[];
	return rows.some((r) => (r.kind === 'email' ? r.value === email : domainMatches(domain, r.value)));
}

export function emailBlocked(linkId: string, email: string) {
	const domain = email.slice(email.lastIndexOf('@') + 1);
	const suffixes = domainSuffixes(domain);
	const marks = suffixes.map(() => '?').join(',');
	return !!sqlite()
		.prepare(
			`SELECT 1 FROM blocks WHERE (link_id IS NULL OR link_id = ?)
			AND ((kind = 'email' AND value = ?) OR (kind = 'domain' AND value IN (${marks || "''"})))`,
		)
		.get(linkId, hmac(email), ...suffixes);
}

export function mayEnter(link: LinkRow, email: string) {
	return emailAllowed(link, email) && !emailBlocked(link.id, email);
}

export function groupOf(linkId: string) {
	return (
		(sqlite()
			.prepare(
				'SELECT g.id, g.default_access FROM link_groups lg JOIN groups g ON g.id = lg.group_id WHERE lg.link_id = ?',
			)
			.get(linkId) as { id: string; default_access: 'view' | 'none' } | undefined) ?? null
	);
}

export type Access = { access: 'view' | 'none'; inherited: boolean };

export function accessMap(roomId: string, group: { id: string; default_access: 'view' | 'none' } | null) {
	const tree = roomTree(roomId);
	const result = new Map<string, Access>();
	if (!group) {
		for (const n of tree) result.set(n.id, { access: 'view', inherited: true });
		return { tree, result };
	}
	const explicit = new Map<string, 'view' | 'none'>();
	for (const p of sqlite()
		.prepare('SELECT folder_id, file_id, access FROM group_permissions WHERE group_id = ?')
		.all(group.id) as { folder_id: string | null; file_id: string | null; access: 'view' | 'none' }[]) {
		explicit.set((p.folder_id ?? p.file_id) as string, p.access);
	}
	for (const n of tree) {
		const own = explicit.get(n.id);
		if (own) {
			result.set(n.id, { access: own, inherited: false });
			continue;
		}
		const parent = n.parentId ? result.get(n.parentId)?.access : group.default_access;
		result.set(n.id, { access: parent ?? group.default_access, inherited: true });
	}
	return { tree, result };
}

export function visibleTree(roomId: string, linkId: string) {
	const { tree, result } = accessMap(roomId, groupOf(linkId));
	const visible = new Set(tree.filter((n) => result.get(n.id)?.access === 'view').map((n) => n.id));
	const byId = new Map(tree.map((n) => [n.id, n]));
	for (const id of [...visible]) {
		let parent = byId.get(id)?.parentId ?? null;
		while (parent && !visible.has(parent)) {
			visible.add(parent);
			parent = byId.get(parent)?.parentId ?? null;
		}
	}
	const kept = tree.filter((n) => visible.has(n.id));
	const counters = new Map<string | null, number>();
	const numbers = new Map<string, string>();
	const out: TreeNode[] = [];
	for (const n of kept) {
		const i = (counters.get(n.parentId) ?? 0) + 1;
		counters.set(n.parentId, i);
		const number = n.parentId ? `${numbers.get(n.parentId)}.${i}` : `${i}`;
		numbers.set(n.id, number);
		out.push({ ...n, number });
	}
	return out;
}

export function fileVisible(roomId: string, linkId: string, fileId: string) {
	return visibleTree(roomId, linkId).some((n) => n.type === 'file' && n.id === fileId);
}

export function upsertViewer(email: string) {
	const key = hmac(email);
	const existing = sqlite().prepare('SELECT id FROM viewers WHERE email_hmac = ?').get(key) as
		| { id: string }
		| undefined;
	if (existing) {
		sqlite().prepare('UPDATE viewers SET email = ?, erased_at = NULL WHERE id = ?').run(email, existing.id);
		return existing.id;
	}
	const id = newId('vwr');
	sqlite()
		.prepare('INSERT INTO viewers (id, email, email_hmac, first_seen_at) VALUES (?, ?, ?, ?)')
		.run(id, email, key, Date.now());
	return id;
}

export function createSession(input: {
	linkId: string;
	viewerId: string | null;
	previewBy?: string | null;
	verified: boolean;
	fields: Record<string, string> | null;
	ndaVersionId: string | null;
	ip: string | null;
	userAgent: string | null;
	ttlMs?: number;
}) {
	const token = randomToken();
	const id = newId('ses');
	const now = Date.now();
	const expiresAt = now + (input.ttlMs ?? sessionDays * 86_400_000);
	sqlite()
		.prepare(
			`INSERT INTO viewer_sessions (id, link_id, viewer_id, preview_by, token_hash, fields_json, verified, nda_version_id, ip, user_agent, last_seen_at, created_at, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			id,
			input.linkId,
			input.viewerId,
			input.previewBy ?? null,
			sha256(token),
			input.fields ? JSON.stringify(input.fields) : null,
			input.verified ? 1 : 0,
			input.ndaVersionId,
			input.ip,
			input.userAgent?.slice(0, 300) ?? null,
			now,
			now,
			expiresAt,
		);
	return { id, token, expiresAt };
}

export type ViewerContext = {
	session: SessionRow;
	link: LinkRow;
	room: RoomRow;
	settings: LinkSettings;
	email: string | null;
	preview: boolean;
	needsNda: boolean;
};

export type SessionCheck =
	| { ok: true; ctx: ViewerContext }
	| { ok: false; reason: 'no_session' | 'unavailable' };

export function checkSession(linkId: string, token: string | undefined): SessionCheck {
	if (!token) return { ok: false, reason: 'no_session' };
	const now = Date.now();
	const session = sqlite()
		.prepare(
			'SELECT * FROM viewer_sessions WHERE token_hash = ? AND link_id = ? AND ended_at IS NULL AND expires_at > ?',
		)
		.get(sha256(token), linkId, now) as SessionRow | undefined;
	if (!session) return { ok: false, reason: 'no_session' };
	return validateSession(session, now);
}

export function checkSessionId(id: string, options: { touch?: boolean } = {}): SessionCheck {
	const now = Date.now();
	const session = sqlite()
		.prepare('SELECT * FROM viewer_sessions WHERE id = ? AND ended_at IS NULL AND expires_at > ?')
		.get(id, now) as SessionRow | undefined;
	return session
		? validateSession(session, now, options.touch !== false)
		: { ok: false, reason: 'no_session' };
}

function validateSession(session: SessionRow, now: number, touch = true): SessionCheck {
	const linkId = session.link_id;
	const link = linkById(linkId);
	const room = link ? findRoom(link.room_id) : undefined;
	if (!link || !room || !linkActive(link, now)) return { ok: false, reason: 'unavailable' };
	const preview = session.preview_by !== null;
	if (preview) {
		const member = sqlite().prepare('SELECT removed_at FROM user WHERE id = ?').get(session.preview_by) as
			| { removed_at: number | null }
			| undefined;
		if (!member || member.removed_at !== null) return { ok: false, reason: 'unavailable' };
	}
	let email: string | null = null;
	if (!preview) {
		const viewer = sqlite().prepare('SELECT email FROM viewers WHERE id = ?').get(session.viewer_id) as
			| { email: string | null }
			| undefined;
		email = viewer?.email ?? null;
		if (!email || !mayEnter(link, email)) return { ok: false, reason: 'unavailable' };
	}
	const settings = effectiveSettings(link, room);
	if (!preview && settings.verifyEmail && !session.verified) return { ok: false, reason: 'unavailable' };
	const needsNda = !preview && settings.requireNda && session.nda_version_id !== room.current_nda_version_id;
	if (touch && now - session.last_seen_at > 60_000)
		sqlite().prepare('UPDATE viewer_sessions SET last_seen_at = ? WHERE id = ?').run(now, session.id);
	return { ok: true, ctx: { session, link, room, settings, email, preview, needsNda } };
}

export function endSession(id: string) {
	sqlite().prepare('UPDATE viewer_sessions SET ended_at = ? WHERE id = ?').run(Date.now(), id);
}
