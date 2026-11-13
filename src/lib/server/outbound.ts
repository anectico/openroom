import { lookup as dnsLookup } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

export class OutboundError extends Error {}

const blockedV4 = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 4],
	['240.0.0.0', 4],
] as const)
	blockedV4.addSubnet(network, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
for (const [network, prefix] of [
	['2001::', 23],
	['2001:db8::', 32],
	['2002::', 16],
	['3fff::', 20],
] as const)
	blockedV6.addSubnet(network, prefix, 'ipv6');

export function privateAddress(ip: string) {
	if (isIP(ip) === 4) return blockedV4.check(ip, 'ipv4');
	if (isIP(ip) === 6) return !globalV6.check(ip, 'ipv6') || blockedV6.check(ip, 'ipv6');
	return true;
}

export function checkUrl(raw: string) {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new OutboundError('That is not a valid address.');
	}
	if (url.protocol !== 'https:') throw new OutboundError('Only https addresses are allowed.');
	if (url.username || url.password)
		throw new OutboundError('Addresses with a user name or password are not allowed.');
	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (
		isIP(host)
			? privateAddress(host)
			: !host.includes('.') || /\.(local|internal|localhost|lan|home|corp)$/i.test(host)
	)
		throw new OutboundError('Private and internal addresses are not allowed.');
	return url;
}

const guardedLookup: typeof dnsLookup = ((
	hostname: string,
	options: object,
	callback: (...args: unknown[]) => void,
) => {
	dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
		if (error) return callback(error);
		const list = addresses as { address: string; family: number }[];
		const bad = list.find((a) => privateAddress(a.address));
		if (bad || !list.length) return callback(new OutboundError('The address resolves to a private network.'));
		const wantsAll = (options as { all?: boolean }).all;
		if (wantsAll) callback(null, list);
		else callback(null, list[0].address, list[0].family);
	});
}) as typeof dnsLookup;

export function postJson(raw: string, body: string, headers: Record<string, string>, timeoutMs = 10_000) {
	const url = checkUrl(raw);
	return new Promise<{ status: number; body: string }>((resolve, reject) => {
		const req = request(
			url,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'content-length': Buffer.byteLength(body),
					...headers,
				},
				lookup: guardedLookup,
				timeout: timeoutMs,
			},
			(res) => {
				let size = 0;
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => {
					size += chunk.length;
					if (size > 64 * 1024) {
						req.destroy(new OutboundError('The response is too large.'));
						return;
					}
					chunks.push(chunk);
				});
				res.on('error', reject);
				res.on('close', () => {
					if (!res.complete) reject(new OutboundError('The request timed out.'));
				});
				res.on('end', () =>
					resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
				);
			},
		);
		const deadline = setTimeout(() => req.destroy(new OutboundError('The request timed out.')), timeoutMs);
		req.on('timeout', () => req.destroy(new OutboundError('The request timed out.')));
		req.on('close', () => clearTimeout(deadline));
		req.on('error', reject);
		req.end(body);
	});
}

export function downloadStream(raw: string) {
	const url = checkUrl(raw);
	return new Promise<{ body: import('node:http').IncomingMessage; length: number | null }>(
		(resolve, reject) => {
			const req = request(
				url,
				{ method: 'GET', lookup: guardedLookup, headers: { 'accept-encoding': 'identity' }, timeout: 15_000 },
				(res) => {
					if (res.statusCode !== 200) {
						res.resume();
						reject(
							new OutboundError(
								'The address must return a file directly with HTTP 200; redirects are not followed.',
							),
						);
						return;
					}
					const rawLength = res.headers['content-length'];
					const length = rawLength === undefined ? null : Number(rawLength);
					if (length !== null && (!Number.isSafeInteger(length) || length < 1)) {
						res.destroy();
						reject(new OutboundError('The server returned an invalid file size.'));
						return;
					}
					res.once('close', () => clearTimeout(deadline));
					resolve({ body: res, length });
				},
			);
			const deadline = setTimeout(
				() => req.destroy(new OutboundError('The file download timed out.')),
				120_000,
			);
			req.on('timeout', () => req.destroy(new OutboundError('The file download stopped sending data.')));
			req.once('error', (error) => {
				clearTimeout(deadline);
				reject(error);
			});
			req.once('close', () => clearTimeout(deadline));
			req.end();
		},
	);
}
