<script lang="ts">
	import { Download, RefreshCw } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	let { linkId }: { linkId: string } = $props();
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
			if (job?.status === 'failed') message = job.error || 'The zip could not be prepared. Try again.';
		} catch (error) {
			if (!disposed) message = error instanceof Error ? error.message : 'The download could not be prepared. Try again.';
		} finally { busy = false; }
	}
</script>

<section class="flex flex-col justify-center rounded-xl border bg-card p-3" aria-label="Download documents">
 {#if job?.status === 'ready' && !message}<Button href="/v/{linkId}/zip/{job.id}?download=1" variant="ghost" class="min-h-11 justify-start"><Download data-icon="inline-start" />Download zip</Button><p class="px-3 text-xs text-muted-foreground" role="status">Your zip is ready.</p>
 {:else}<Button variant="ghost" class="min-h-11 justify-start" disabled={busy} onclick={prepare}>{#if message}<RefreshCw data-icon="inline-start" />{:else}<Download data-icon="inline-start" />{/if}{busy ? `Preparing… ${job?.progress ?? 0}%` : message ? 'Retry download' : 'Download documents'}</Button><p class="px-3 text-xs text-muted-foreground" role="status">{busy ? 'Keep this page open while your zip is prepared.' : 'A zip of the files shared with you'}</p>{/if}
 {#if message}<p role="alert" class="mt-2 px-3 text-xs text-destructive">{message}</p>{/if}
</section>
