<script lang="ts">
	import { Download, RefreshCw } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	let { linkId, disabled = false }: { linkId: string; disabled?: boolean } = $props();
	let busy = $state(false);
	let job = $state<{ id: string; status: string; progress: number; error?: string | null } | null>(null);
	let message = $state('');
	let disposed = false;
	let controller: AbortController | null = null;
	let delay: ReturnType<typeof setTimeout> | undefined;
	let wake: (() => void) | undefined;
	onDestroy(() => { disposed = true; controller?.abort(); clearTimeout(delay); wake?.(); });

	async function request(path: string, method = 'GET') {
		controller = new AbortController();
		const timer = setTimeout(() => controller?.abort(), 15_000);
		try {
			const response = await fetch(path, { method, signal: controller.signal });
			const body = await response.json().catch(() => null);
			if (!response.ok) {
				if ([404, 410].includes(response.status)) job = null;
				throw new Error(body?.error ?? body?.message ?? 'The download is unavailable. Open your invitation again if your session has ended.');
			}
			if (!body?.id || !['pending', 'running', 'ready', 'failed'].includes(body.status)) throw new Error('The server returned an unexpected response. Try again.');
			return body;
		} catch (error) {
			if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) throw new Error('Connection interrupted. Check your connection, then retry.');
			throw error;
		} finally { clearTimeout(timer); }
	}

	async function prepare() {
		if (busy) return;
		busy = true;
		message = '';
		try {
			const base = `/v/${linkId}/zip`;
			job = await request(job?.id && job.status !== 'failed' ? `${base}/${job.id}` : base, job?.id && job.status !== 'failed' ? 'GET' : 'POST');
			while (!disposed && job && ['pending', 'running'].includes(job.status)) {
				await new Promise<void>((resolve) => { wake = resolve; delay = setTimeout(resolve, 1500); });
				if (disposed) return;
				job = await request(`${base}/${job.id}`);
			}
			if (job?.status === 'failed') message = job.error || 'The ZIP could not be prepared. Try again.';
		} catch (error) {
			if (!disposed) message = error instanceof Error ? error.message : 'The download could not be prepared. Try again.';
		} finally { busy = false; }
	}
</script>

<div class="flex min-w-0 flex-col gap-1 sm:items-end">
 {#if job?.status === 'ready' && !message}<Button href="/v/{linkId}/zip/{job.id}?download=1" variant="outline" size="sm"><Download data-icon="inline-start" />Save ZIP</Button><p class="text-xs text-muted-foreground" role="status">Your ZIP is ready.</p>
 {:else}<Button variant="outline" size="sm" disabled={busy || disabled} onclick={prepare}>{#if message}<RefreshCw data-icon="inline-start" />{:else}<Download data-icon="inline-start" />{/if}{busy ? `Preparing… ${job?.progress ?? 0}%` : message ? 'Retry ZIP' : 'Download all as ZIP'}</Button>{#if busy}<p class="text-xs text-muted-foreground" role="status">Keep this page open while your ZIP is prepared.</p>{/if}{/if}
 {#if message}<p role="alert" class="max-w-xs text-xs text-destructive sm:text-right">{message}</p>{/if}
</div>
