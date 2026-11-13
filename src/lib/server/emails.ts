import { domainToASCII } from 'node:url';

export function normaliseDomain(value: string) {
	if (
		/[\s/\\?#:%@]/.test(value.trim()) ||
		[...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
	)
		return null;
	const ascii = domainToASCII(value.trim().toLowerCase().replace(/\.$/, ''));
	if (
		!ascii ||
		ascii.length > 253 ||
		!ascii.includes('.') ||
		!ascii.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))
	)
		return null;
	return ascii;
}

export function normaliseEmail(value: string) {
	const trimmed = value.trim();
	const at = trimmed.lastIndexOf('@');
	if (at <= 0) return null;
	const local = trimmed.slice(0, at).toLowerCase();
	const domain = normaliseDomain(trimmed.slice(at + 1));
	if (
		!domain ||
		local.length > 64 ||
		!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) ||
		local.startsWith('.') ||
		local.endsWith('.') ||
		local.includes('..')
	)
		return null;
	if (local.length + domain.length + 1 > 254) return null;
	return `${local}@${domain}`;
}

export function domainMatches(emailDomain: string, entry: string) {
	return emailDomain === entry || emailDomain.endsWith(`.${entry}`);
}
