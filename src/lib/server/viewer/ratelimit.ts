type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let sweptAt = 0;

function sweep(now: number) {
	if (now - sweptAt < 60_000) return;
	sweptAt = now;
	for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

export function hit(key: string, max: number, windowMs: number) {
	const now = Date.now();
	sweep(now);
	const b = buckets.get(key);
	if (!b || b.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	b.count++;
	return b.count <= max;
}

export function blocked(key: string, max: number) {
	const b = buckets.get(key);
	return !!b && b.resetAt > Date.now() && b.count >= max;
}

function expandV6(ip: string) {
	const [head, tail = ''] = ip.split('::');
	const a = head ? head.split(':') : [];
	const b = tail ? tail.split(':') : [];
	const fill = ip.includes('::') ? Array(Math.max(0, 8 - a.length - b.length)).fill('0') : [];
	return [...a, ...fill, ...b];
}

export function ipKey(ip: string | null) {
	if (!ip) return 'unknown';
	const plain = ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
	if (!plain.includes(':')) return plain;
	return `${expandV6(plain.split('%')[0].toLowerCase())
		.slice(0, 4)
		.map((p) => p.replace(/^0+(?=.)/, ''))
		.join(':')}::/64`;
}

export const limits = {
	tokenLookup: { max: 120, windowMs: 10 * 60_000 },
	password: { max: 10, windowMs: 15 * 60_000 },
	passwordLink: { max: 100, windowMs: 60 * 60_000 },
	codeSendIp: { max: 10, windowMs: 60 * 60_000 },
	beacon: { max: 120, windowMs: 60_000 },
};
