export function normalizePdfText(text: string) {
	return text.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase().replace(/ς/g, 'σ');
}

function mappedText(text: string) {
	let normalized = '';
	const starts: number[] = [],
		ends: number[] = [];
	let offset = 0;
	for (const { segment: char } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
		const part = normalizePdfText(char);
		for (const unit of part) {
			if (unit === ' ' && normalized.endsWith(' ')) {
				ends[ends.length - 1] = offset + char.length;
				continue;
			}
			normalized += unit;
			for (let i = 0; i < unit.length; i++) {
				starts.push(offset);
				ends.push(offset + char.length);
			}
		}
		offset += char.length;
	}
	return { normalized, starts, ends };
}

export function matchRanges(text: string, query: string) {
	const needle = normalizePdfText(query).trim();
	if (!needle) return [];
	const mapped = mappedText(text);
	const ranges: { start: number; end: number }[] = [];
	let at = mapped.normalized.indexOf(needle);
	while (at >= 0 && ranges.length < 1000) {
		const range = { start: mapped.starts[at], end: mapped.ends[at + needle.length - 1] };
		const previous = ranges.at(-1);
		if (previous && range.start < previous.end) previous.end = Math.max(previous.end, range.end);
		else ranges.push(range);
		at = mapped.normalized.indexOf(needle, at + needle.length);
	}
	return ranges;
}

export function searchExcerpt(text: string, query: string) {
	const match = matchRanges(text, query)[0];
	if (!match) return '';
	let start = Math.max(0, match.start - 35),
		end = Math.min(text.length, match.end + 85);
	while (start > 0 && !/\s/.test(text[start - 1])) start--;
	while (end < text.length && !/\s/.test(text[end])) end++;
	return `${start ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export function textParts(text: string, query: string) {
	const parts: { text: string; match: boolean }[] = [];
	let offset = 0;
	for (const range of matchRanges(text, query)) {
		if (range.start > offset) parts.push({ text: text.slice(offset, range.start), match: false });
		parts.push({ text: text.slice(range.start, range.end), match: true });
		offset = range.end;
	}
	if (offset < text.length) parts.push({ text: text.slice(offset), match: false });
	return parts;
}

export function highlightPdfText(container: HTMLElement, query: string) {
	const spans = [...container.querySelectorAll<HTMLSpanElement>('span')].filter(
		(span) => !span.querySelector('span'),
	);
	for (const span of spans)
		if (span.querySelector('mark')) span.replaceChildren(document.createTextNode(span.textContent ?? ''));
	const ranges: { span: HTMLSpanElement; text: string; start: number; end: number }[] = [];
	let joined = '';
	for (const span of spans) {
		const text = span.textContent ?? '';
		const start = joined.length;
		joined += text;
		ranges.push({ span, text, start, end: joined.length });
		joined += ' ';
	}
	const matches = matchRanges(joined, query);
	for (const range of ranges) {
		const overlaps = matches.filter((m) => m.end > range.start && m.start < range.end);
		delete range.span.dataset.match;
		if (!overlaps.length) continue;
		range.span.dataset.match = 'true';
		const fragment = document.createDocumentFragment();
		let offset = 0;
		for (const match of overlaps) {
			const start = Math.max(0, match.start - range.start),
				end = Math.min(range.text.length, match.end - range.start);
			fragment.append(document.createTextNode(range.text.slice(offset, start)));
			const mark = document.createElement('mark');
			mark.textContent = range.text.slice(start, end);
			fragment.append(mark);
			offset = end;
		}
		fragment.append(document.createTextNode(range.text.slice(offset)));
		range.span.replaceChildren(fragment);
	}
}
