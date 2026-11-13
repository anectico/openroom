export function browseParameters(source: Pick<URLSearchParams, 'get'>) {
	const out = new URLSearchParams();
	for (const key of ['q', 'folder']) {
		const value = source.get(key)?.slice(0, key === 'q' ? 200 : 100);
		if (value) out.set(key, value);
	}
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
