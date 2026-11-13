import { error } from '@sveltejs/kit';
import { documentReviewStates } from '#lib/server/document-reviews.ts';
import { visiblePins } from '#lib/server/pins.ts';
import { visibleTree } from '#lib/server/viewer/access.ts';
import { requireViewer } from '#lib/server/viewer/context.ts';
import { currentVersion } from '#lib/server/viewer/serve.ts';
import { trackOnce } from '#lib/server/viewer/tracking.ts';
import { browseParameters } from '#lib/viewer/navigation.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const ctx = requireViewer(event);
	const tree = visibleTree(ctx.room.id, ctx.link.id);
	const pins = visiblePins(ctx.room.id, tree);
	const guide = event.url.searchParams.get('guide') === '1' && pins.some((n) => n.id === event.params.fileId);
	const files = guide ? pins : tree.filter((n) => n.type === 'file');
	const index = files.findIndex((n) => n.id === event.params.fileId);
	if (index < 0) error(404, 'unavailable');
	const node = files[index];
	const version = currentVersion(node.id);
	if (!version) error(404, 'unavailable');
	trackOnce(ctx, 'file_open', node.id);
	const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
	const who = ctx.preview ? 'Preview' : (ctx.email ?? '');
	const back = browseParameters(event.url.searchParams);
	const folder = tree.find((n) => n.type === 'folder' && n.id === back.get('folder'));
	if (!folder) back.delete('folder');
	const reviewState = documentReviewStates(ctx, pins).find((state) => state.fileId === node.id) ?? null;
	return {
		reviewState,
		reviewable: pins.some((p) => p.id === node.id),
		reviewed: reviewState?.reviewed ?? false,
		initialPage: /^\d{1,6}$/.test(event.url.searchParams.get('page') ?? '')
			? Number(event.url.searchParams.get('page'))
			: null,
		guide,
		guidePosition: guide ? index + 1 : null,
		guideTotal: guide ? files.length : null,
		backHref: `/v/${ctx.link.id}${back.size ? `?${back}` : ''}`,
		backLabel: back.get('q')
			? 'Back to search'
			: back.get('changed') === '1'
				? 'Back to changed documents'
				: folder
					? `Back to ${folder.name}`
					: 'All documents',
		file: {
			id: node.id,
			number: node.number,
			name: node.name,
			kind: node.kind,
			size: node.size,
			version: node.version,
		},
		prev: index > 0 ? { id: files[index - 1].id, name: files[index - 1].name } : null,
		next: index < files.length - 1 ? { id: files[index + 1].id, name: files[index + 1].name } : null,
		watermark: ctx.settings.watermark ? `${who} · ${event.getClientAddress()} · ${stamp} UTC` : null,
		protection: ctx.settings.screenshotProtection,
		canDownload: node.kind === 'download' || ctx.settings.downloads === 'per_file',
	};
};
