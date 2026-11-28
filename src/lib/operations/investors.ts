import { z } from 'zod';
import { database } from '../server/db/index.ts';
import { newId } from '../server/ids.ts';
import { hmac } from '../server/settings.ts';
import { emailAllowed, emailBlocked, type LinkRow, linkById } from '../server/viewer/access.ts';
import { confirmField, defineOperation, notFound, OpError } from './define.ts';
import { writableRoom } from './rooms.ts';

const sqlite = () => database().sqlite;

const blockOut = z.object({
	id: z.string(),
	kind: z.enum(['email', 'domain']),
	value: z.string(),
});

const linkAccess = z.object({
	linkId: z.string(),
	roomId: z.string(),
	roomName: z.string(),
	linkLabel: z.string(),
	status: z.enum(['active', 'expired', 'revoked']),
	via: z
		.enum(['email', 'domain', 'open', 'none'])
		.describe(
			'Why the allow list lets them in: their email, their domain, an open link, or nothing any more.',
		),
	blockedOnLink: z.boolean(),
	canEnter: z.boolean().describe('Whether the link would let them in now, before verification and NDA.'),
	groupName: z.string().nullable().describe('The group that decides which documents this link shows.'),
	lastVisitAt: z.number().nullable(),
});

type Viewer = { id: string; email: string | null };

function loadViewer(id: string) {
	const v = sqlite().prepare('SELECT id, email FROM viewers WHERE id = ?').get(id) as Viewer | undefined;
	if (!v) throw notFound('Investor');
	return v;
}

function suffixes(email: string) {
	const parts = email.slice(email.lastIndexOf('@') + 1).split('.');
	return parts.slice(0, -1).map((_, i) => parts.slice(i).join('.'));
}

function workspaceBlocks(email: string) {
	const domains = suffixes(email);
	return (
		sqlite()
			.prepare(
				`SELECT id, kind, display FROM blocks WHERE link_id IS NULL
				AND ((kind = 'email' AND value = ?) OR (kind = 'domain' AND value IN (${domains.map(() => '?').join(',') || "''"})))`,
			)
			.all(hmac(email), ...domains) as { id: string; kind: 'email' | 'domain'; display: string | null }[]
	).map((b) => ({ id: b.id, kind: b.kind, value: b.display ?? 'Erased investor' }));
}

function statusOf(link: LinkRow) {
	if (link.revoked_at !== null) return 'revoked' as const;
	if (link.expires_at !== null && link.expires_at <= Date.now()) return 'expired' as const;
	return 'active' as const;
}

function emailEntry(linkId: string, email: string) {
	return sqlite()
		.prepare("SELECT id FROM link_allow WHERE link_id = ? AND kind = 'email' AND value = ?")
		.get(linkId, email) as { id: string } | undefined;
}

function via(link: LinkRow, email: string) {
	if (link.open) return 'open' as const;
	if (emailEntry(link.id, email)) return 'email' as const;
	return emailAllowed(link, email) ? ('domain' as const) : ('none' as const);
}

function linkBlocked(linkId: string, email: string) {
	return !!sqlite()
		.prepare("SELECT 1 FROM blocks WHERE link_id = ? AND kind = 'email' AND value = ?")
		.get(linkId, hmac(email));
}

export const getViewerAccess = defineOperation({
	name: 'get_viewer_access',
	summary:
		'Show what one investor can reach: every link whose allow list names their email or domain, or that they visited, with its room, status, group and last visit, plus install-wide blocks that match them.',
	role: 'observer',
	http: { method: 'GET', path: '/viewers/{viewerId}/access' },
	input: z.object({ viewerId: z.string() }),
	output: z.object({
		viewerId: z.string(),
		email: z.string().nullable(),
		blocked: z.boolean().describe('Blocked from every room by an install-wide email or domain block.'),
		blocks: z.array(blockOut),
		links: z.array(linkAccess),
	}),
	audit: false,
	run: (input) => {
		const v = loadViewer(input.viewerId);
		if (!v.email) return { viewerId: v.id, email: null, blocked: false, blocks: [], links: [] };
		const email = v.email;
		const visits = new Map(
			(
				sqlite()
					.prepare(
						'SELECT link_id AS linkId, max(last_seen_at) AS at FROM viewer_sessions WHERE viewer_id = ? AND preview_by IS NULL GROUP BY link_id',
					)
					.all(v.id) as { linkId: string; at: number }[]
			).map((s) => [s.linkId, s.at]),
		);
		const rows = sqlite()
			.prepare(
				`SELECT l.*, r.name AS room_name, g.name AS group_name FROM links l JOIN rooms r ON r.id = l.room_id
				LEFT JOIN link_groups lg ON lg.link_id = l.id LEFT JOIN groups g ON g.id = lg.group_id
				ORDER BY r.created_at, l.created_at`,
			)
			.all() as (LinkRow & { room_name: string; group_name: string | null })[];
		const links = rows
			.filter((l) => visits.has(l.id) || (!l.open && l.revoked_at === null && emailAllowed(l, email)))
			.map((l) => {
				const status = statusOf(l);
				return {
					linkId: l.id,
					roomId: l.room_id,
					roomName: l.room_name,
					linkLabel: l.label,
					status,
					via: via(l, email),
					blockedOnLink: linkBlocked(l.id, email),
					canEnter: status === 'active' && emailAllowed(l, email) && !emailBlocked(l.id, email),
					groupName: l.group_name,
					lastVisitAt: visits.get(l.id) ?? null,
				};
			});
		const blocks = workspaceBlocks(email);
		return { viewerId: v.id, email, blocked: blocks.length > 0, blocks, links };
	},
});

export const removeViewerFromLink = defineOperation({
	name: 'remove_viewer_from_link',
	summary:
		'Stop one investor entering through one link: removes their email from its allow list and, when the link is open, their domain is allowed or theirs is the only entry, blocks their email on that link. Their open sessions on the link end at once. Other links and rooms are unchanged.',
	role: 'admin',
	http: { method: 'POST', path: '/viewers/{viewerId}/links/{linkId}/remove' },
	input: z.object({ viewerId: z.string(), linkId: z.string(), ...confirmField }),
	output: z.object({
		removedFromAllowList: z.boolean(),
		blockedOnLink: z.boolean(),
		endedSessions: z.number(),
	}),
	destructive: (input) => {
		const v = loadViewer(input.viewerId);
		const link = linkById(input.linkId);
		if (!link) throw notFound('Link');
		return `${v.email ?? 'This investor'} will no longer be able to open the link “${link.label}”; their open sessions on it end now.`;
	},
	audit: {
		target: (i) => ({ type: 'viewer', id: i.viewerId }),
		detail: (i, o) => ({
			linkId: i.linkId,
			removedFromAllowList: o.removedFromAllowList,
			blockedOnLink: o.blockedOnLink,
		}),
	},
	run: (input) => {
		const v = loadViewer(input.viewerId);
		if (!v.email) throw new OpError(409, 'erased', 'This investor was erased; there is no email to remove.');
		const email = v.email;
		const link = linkById(input.linkId);
		if (!link) throw notFound('Link');
		const room = writableRoom(link.room_id);
		if (link.revoked_at !== null)
			throw new OpError(409, 'revoked', 'This link is revoked; nobody can enter through it.');
		let removed = false;
		let blocked = false;
		let ended = 0;
		sqlite()
			.transaction(() => {
				const entry = emailEntry(link.id, email);
				const others = (
					sqlite()
						.prepare('SELECT count(*) AS n FROM link_allow WHERE link_id = ? AND id != ?')
						.get(link.id, entry?.id ?? '') as { n: number }
				).n;
				if (entry && (others > 0 || link.open)) {
					sqlite().prepare('DELETE FROM link_allow WHERE id = ?').run(entry.id);
					removed = true;
				}
				const current = linkById(link.id) as LinkRow;
				if (emailAllowed(current, email) && !linkBlocked(link.id, email)) {
					sqlite()
						.prepare(
							"INSERT INTO blocks (id, link_id, kind, value, display, created_at) VALUES (?, ?, 'email', ?, ?, ?)",
						)
						.run(newId('blk'), link.id, hmac(email), email, Date.now());
					blocked = true;
				}
				ended = sqlite()
					.prepare(
						'UPDATE viewer_sessions SET ended_at = ? WHERE link_id = ? AND viewer_id = ? AND preview_by IS NULL AND ended_at IS NULL',
					)
					.run(Date.now(), link.id, v.id).changes;
			})
			.immediate();
		if (!removed && !blocked && !ended && !emailAllowed(link, email))
			throw new OpError(409, 'not_on_link', `${email} cannot enter ${room.name} through this link already.`);
		return { removedFromAllowList: removed, blockedOnLink: blocked, endedSessions: ended };
	},
});
