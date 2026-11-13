import { toast } from 'svelte-sonner';
import { invalidateAll } from '$app/navigation';

export class OpFailure extends Error {
	code: string;
	detail: Record<string, unknown>;
	constructor(code: string, message: string, detail: Record<string, unknown>) {
		super(message);
		this.code = code;
		this.detail = detail;
	}
}

export async function op<T = Record<string, unknown>>(
	name: string,
	input: Record<string, unknown> = {},
	signal?: AbortSignal,
): Promise<T> {
	const response = await fetch(`/admin/api/${name}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
		signal,
	});
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		const e = body?.error ?? {};
		throw new OpFailure(e.code ?? 'error', e.message ?? 'Something went wrong.', e);
	}
	return body as T;
}

export async function act<T>(name: string, input: Record<string, unknown>, success?: string) {
	try {
		const result = await op<T>(name, input);
		if (success) toast.success(success);
		await invalidateAll();
		return result;
	} catch (e) {
		toast.error(e instanceof Error ? e.message : 'Something went wrong.');
		return null;
	}
}

export async function attempt<T>(
	name: string,
	input: Record<string, unknown>,
	success?: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string; failure: OpFailure | null }> {
	try {
		const data = await op<T>(name, input);
		if (success) toast.success(success);
		await invalidateAll();
		return { ok: true, data };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : 'Something went wrong.',
			failure: e instanceof OpFailure ? e : null,
		};
	}
}

export async function copyText(text: string, done = 'Copied') {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(done);
		return;
	} catch {}
	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.opacity = '0';
	document.body.append(area);
	area.select();
	const ok = document.execCommand('copy');
	area.remove();
	if (ok) toast.success(done);
	else toast.error('This browser blocked copying. Open the page over HTTPS and try again.');
}

export function formatBytes(n: number | null) {
	if (n === null) return '';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	let v = n;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatDate(ms: number | null, timeZone = 'UTC') {
	if (ms === null) return '';
	return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(ms);
}

export function relative(ms: number | null, timeZone = 'UTC') {
	if (ms === null) return 'never';
	const diff = Date.now() - ms;
	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	const steps: [number, Intl.RelativeTimeFormatUnit][] = [
		[60_000, 'second'],
		[3_600_000, 'minute'],
		[86_400_000, 'hour'],
		[30 * 86_400_000, 'day'],
	];
	const units = [1000, 60_000, 3_600_000, 86_400_000];
	for (const [i, [limit, unit]] of steps.entries()) {
		if (Math.abs(diff) < limit) return rtf.format(-Math.round(diff / units[i]), unit);
	}
	return formatDate(ms, timeZone);
}
