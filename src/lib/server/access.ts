import { normaliseDomain, normaliseEmail } from './emails.ts';
import { hmac } from './settings.ts';

export type Entry = { kind: 'email' | 'domain'; value: string };

export function parseEntry(raw: string): Entry | null {
	const text = raw.trim();
	if (text.startsWith('@') || text.startsWith('*@')) {
		const domain = normaliseDomain(text.slice(text.indexOf('@') + 1));
		return domain ? { kind: 'domain', value: domain } : null;
	}
	if (text.includes('@')) {
		const email = normaliseEmail(text);
		return email ? { kind: 'email', value: email } : null;
	}
	const domain = normaliseDomain(text);
	return domain ? { kind: 'domain', value: domain } : null;
}

export function parseEntries(raw: string[]) {
	const entries: Entry[] = [];
	const invalid: string[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		if (!item.trim()) continue;
		const entry = parseEntry(item);
		if (!entry) {
			invalid.push(item);
			continue;
		}
		const k = `${entry.kind}:${entry.value}`;
		if (!seen.has(k)) entries.push(entry);
		seen.add(k);
	}
	return { entries, invalid };
}

export function blockValue(entry: Entry) {
	return entry.kind === 'email' ? hmac(entry.value) : entry.value;
}
