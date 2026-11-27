export function browseParameters(source: Pick<URLSearchParams, 'get'>) {
	const out = new URLSearchParams();
	const folder = source.get('folder')?.slice(0, 100);
	if (folder) out.set('folder', folder);
	const y = Number(source.get('y'));
	if (Number.isFinite(y) && y > 0) out.set('y', String(Math.min(1_000_000, Math.round(y))));
	if (source.get('changed') === '1') out.set('changed', '1');
	if (source.get('expanded') === '1') out.set('expanded', '1');
	return out;
}

export function documentHref(
	linkId: string,
	fileId: string,
	source: Pick<URLSearchParams, 'get'>,
	guide = false,
) {
	const params = browseParameters(source);
	if (guide) params.set('guide', '1');
	const query = params.toString();
	return `/v/${linkId}/view/${fileId}${query ? `?${query}` : ''}`;
}
