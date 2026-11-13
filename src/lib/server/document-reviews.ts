import { database } from './db/index.ts';
import { investorIdentity } from './investor-attention.ts';
import { visiblePins } from './pins.ts';
import type { TreeNode } from './rooms.ts';
import { type ViewerContext, visibleTree } from './viewer/access.ts';

export function documentReviewStates(ctx: ViewerContext, pins: TreeNode[]) {
	if (ctx.preview || !ctx.session.viewer_id) return [];
	const scope = investorIdentity(ctx).scope;
	const find = database().sqlite.prepare(`SELECT r.version AS reviewedVersion, v.created_at AS updatedAt
 FROM file_versions v LEFT JOIN document_reviews r ON r.file_id = v.file_id AND r.scope = ?
 WHERE v.file_id = ? AND v.version = ?`);
	return pins
		.map((file) => {
			const row = find.get(scope, file.id, file.version) as
				| {
						reviewedVersion: number | null;
						updatedAt: number;
				  }
				| undefined;
			if (!row) return null;
			return {
				fileId: file.id,
				version: file.version,
				updatedAt: row.updatedAt,
				reviewed: row.reviewedVersion === file.version,
				previousVersion: row.reviewedVersion !== file.version ? row.reviewedVersion : null,
			};
		})
		.filter((state) => state !== null);
}

export function reviewedDocuments(ctx: ViewerContext, pins: TreeNode[]) {
	return documentReviewStates(ctx, pins)
		.filter((state) => state.reviewed)
		.map((state) => state.fileId);
}

export function setDocumentReviewed(ctx: ViewerContext, fileId: string, version: number, reviewed: boolean) {
	if (ctx.preview || !ctx.session.viewer_id) return 'unavailable';
	const sqlite = database().sqlite;
	return sqlite
		.transaction(() => {
			const file = visiblePins(ctx.room.id, visibleTree(ctx.room.id, ctx.link.id)).find(
				(file) => file.id === fileId,
			);
			if (!file) return 'unavailable';
			if (file.version !== version) return 'changed';
			const who = investorIdentity(ctx);
			if (reviewed)
				sqlite
					.prepare(`INSERT INTO document_reviews (scope, file_id, viewer_id, session_id, version, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(scope, file_id) DO UPDATE SET version = excluded.version, reviewed_at = excluded.reviewed_at`)
					.run(who.scope, fileId, who.viewerId, who.sessionId, version, Date.now());
			else
				sqlite.prepare('DELETE FROM document_reviews WHERE scope = ? AND file_id = ?').run(who.scope, fileId);
			return 'ok';
		})
		.immediate();
}
