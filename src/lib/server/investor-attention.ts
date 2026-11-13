import { database } from './db/index.ts';
import { viewerConversation, viewerConversations } from './questions.ts';
import type { TreeNode } from './rooms.ts';
import type { ViewerContext } from './viewer/access.ts';

const sqlite = () => database().sqlite;

export function investorIdentity(ctx: ViewerContext) {
	const verified = !!ctx.session.verified && !!ctx.session.viewer_id;
	return {
		scope: verified ? `viewer:${ctx.session.viewer_id}` : `session:${ctx.session.id}`,
		viewerId: verified ? ctx.session.viewer_id : null,
		sessionId: verified ? null : ctx.session.id,
	};
}

export function documentChanges(ctx: ViewerContext, tree: TreeNode[]) {
	const unchanged = () => ({
		tree: tree.map((file) => ({ ...file, change: null as 'new' | 'updated' | null })),
		since: null as number | null,
	});
	if (ctx.preview || !ctx.session.viewer_id) return unchanged();
	const who = investorIdentity(ctx);
	const scope = `${ctx.link.id}:${who.scope}`;
	const now = Date.now();
	const seen = Object.fromEntries(
		tree.filter((file) => file.type === 'file').map((file) => [file.id, file.version]),
	);
	return sqlite()
		.transaction(() => {
			const previous = sqlite().prepare('SELECT * FROM investor_visits WHERE scope = ?').get(scope) as
				| {
						baseline_json: string | null;
						baseline_at: number | null;
						seen_json: string;
						seen_at: number;
				  }
				| undefined;
			const newVisit =
				previous && (now - previous.seen_at > 30 * 60_000 || ctx.session.created_at > previous.seen_at);
			const baseline = newVisit ? previous.seen_json : (previous?.baseline_json ?? null);
			const since = newVisit ? previous.seen_at : (previous?.baseline_at ?? null);
			sqlite()
				.prepare(`INSERT INTO investor_visits (scope, link_id, viewer_id, session_id, last_session_id, baseline_json, baseline_at, seen_json, seen_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(scope) DO UPDATE SET last_session_id = excluded.last_session_id,
			baseline_json = excluded.baseline_json, baseline_at = excluded.baseline_at, seen_json = excluded.seen_json, seen_at = excluded.seen_at`)
				.run(
					scope,
					ctx.link.id,
					who.viewerId,
					who.sessionId,
					ctx.session.id,
					baseline,
					since,
					JSON.stringify(seen),
					now,
				);
			if (!baseline || since === null) return unchanged();
			const versions = JSON.parse(baseline) as Record<string, number>;
			const dates = new Map(
				(
					sqlite()
						.prepare(`SELECT f.id, f.created_at, v.created_at AS version_at FROM files f
			JOIN file_versions v ON v.file_id = f.id AND v.version = f.current_version WHERE f.room_id = ?`)
						.all(ctx.room.id) as { id: string; created_at: number; version_at: number }[]
				).map((file) => [file.id, file]),
			);
			return {
				since,
				tree: tree.map((file) => {
					const date = dates.get(file.id);
					let change: 'new' | 'updated' | null = null;
					if (file.type === 'file' && date) {
						if (!(file.id in versions) && date.created_at > since) change = 'new';
						else if (
							(file.id in versions && versions[file.id] !== file.version) ||
							(!(file.id in versions) && date.version_at > since)
						)
							change = 'updated';
					}
					return { ...file, change };
				}),
			};
		})
		.immediate();
}

export function unreadReplies(ctx: ViewerContext) {
	if (ctx.preview) return new Map<string, number>();
	const scope = investorIdentity(ctx).scope;
	const query =
		sqlite().prepare(`SELECT count(*) AS count FROM messages m WHERE m.conversation_id = ? AND m.author != 'viewer'
		AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.message_id = m.id AND r.scope = ?)`);
	return new Map(
		viewerConversations(ctx).map((conversation) => [
			conversation.id,
			(query.get(conversation.id, scope) as { count: number }).count,
		]),
	);
}

export function markRepliesRead(ctx: ViewerContext, conversationId: string, messageIds: string[]) {
	if (ctx.preview || !viewerConversation(ctx, conversationId)) return false;
	const who = investorIdentity(ctx);
	const insert =
		sqlite().prepare(`INSERT OR IGNORE INTO message_reads (message_id, scope, viewer_id, session_id, read_at)
		SELECT id, ?, ?, ?, ? FROM messages WHERE id = ? AND conversation_id = ? AND author != 'viewer'`);
	sqlite()
		.transaction(() => {
			for (const id of messageIds)
				insert.run(who.scope, who.viewerId, who.sessionId, Date.now(), id, conversationId);
		})
		.immediate();
	return true;
}

export function unreadMessageIds(ctx: ViewerContext, conversationId: string) {
	if (ctx.preview) return [];
	return (
		sqlite()
			.prepare(`SELECT m.id FROM messages m WHERE m.conversation_id = ? AND m.author != 'viewer'
		AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.message_id = m.id AND r.scope = ?)`)
			.all(conversationId, investorIdentity(ctx).scope) as { id: string }[]
	).map((message) => message.id);
}
