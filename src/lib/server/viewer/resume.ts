import { database } from '../db/index.ts';
import type { ViewerContext } from './access.ts';
import { currentVersionId } from './serve.ts';

export function lastReadPage(ctx: ViewerContext, fileId: string) {
	if (ctx.preview || !ctx.session.viewer_id) return null;
	const version = currentVersionId(fileId);
	if (version?.kind !== 'pdf') return null;
	const scope = ctx.session.verified ? 'viewer_id' : 'session_id';
	const row = database()
		.sqlite.prepare(
			`SELECT page FROM page_reads WHERE ${scope} = ? AND file_version_id = ? ORDER BY last_at DESC, page DESC LIMIT 1`,
		)
		.get(ctx.session.verified ? ctx.session.viewer_id : ctx.session.id, version.id) as
		| { page: number }
		| undefined;
	if (!row) return null;
	return { version: version.version, page: version.pages ? Math.min(row.page, version.pages) : row.page };
}
