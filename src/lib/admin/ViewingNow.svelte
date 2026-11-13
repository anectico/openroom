<script lang="ts">
	import { RefreshCw } from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { op } from './op.ts';

	type Viewer = { sessionId: string; viewerId: string; email: string | null; roomName: string; fileTitle: string | null };
	let { initial, onchange }: { initial: Viewer[]; onchange?: (count: number, paused: boolean) => void } = $props();
	let viewers = $state(untrack(() => initial));
	let updatedAt = $state<number | null>(null);
	let stale = $state(false);
	let busy = $state(false);
	let refresh = $state<() => void>(() => {});

	$effect(() => onchange?.(viewers.length, stale));

	onMount(() => {
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		let controller: AbortController | null = null;
		async function update() {
			clearTimeout(timer);
			if (stopped || busy || document.visibilityState === 'hidden') return;
			if (!navigator.onLine) { stale = true; return; }
			busy = true;
			controller = new AbortController();
			const timeout = setTimeout(() => controller?.abort(), 10_000);
			try {
				const result = await op<{ viewing: Viewer[] }>('get_viewing_now', {}, controller.signal);
				if (!Array.isArray(result?.viewing)) throw new Error('Could not refresh');
				if (stopped) return;
				viewers = result.viewing;
				updatedAt = Date.now();
				stale = false;
			} catch {
				if (!stopped) stale = true;
			} finally {
				clearTimeout(timeout);
				busy = false;
				if (!stopped) timer = setTimeout(update, 15_000);
			}
		}
		function visibility() {
			if (document.visibilityState === 'hidden') clearTimeout(timer);
			else void update();
		}
		function offline() { stale = true; }
		refresh = () => void update();
		void update();
		document.addEventListener('visibilitychange', visibility);
		window.addEventListener('online', refresh);
		window.addEventListener('offline', offline);
		return () => {
			stopped = true;
			clearTimeout(timer);
			controller?.abort();
			document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('online', refresh);
			window.removeEventListener('offline', offline);
		};
	});
</script>

<Card.Root class="gap-0 py-0 shadow-none">
	<Card.Header class="flex flex-row items-center justify-between gap-2 px-5 pt-5 pb-3">
		<Card.Title class="text-sm">In the room now</Card.Title>
		<Button variant="ghost" size="icon" class="size-11" aria-label="Refresh current viewers" disabled={busy} onclick={refresh}><RefreshCw /></Button>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4 px-5 pb-5">
		<p role="status" class="text-xs text-muted-foreground">{#if stale}Updates paused. Showing the last known activity.{:else if updatedAt}Updated <time datetime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time> · refreshes every 15 seconds{:else}Checking current activity…{/if}</p>
		{#if !viewers.length}
			<p class="text-xs leading-relaxed text-muted-foreground">{stale ? 'No investors were viewing at the last update.' : 'No investors are viewing right now.'}</p>
		{:else}
			<ul class="flex flex-col gap-4">{#each viewers as viewer (viewer.sessionId)}<li class="flex gap-2.5"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-medium text-primary">{viewer.email?.[0]?.toUpperCase() ?? 'V'}</span><div class="min-w-0"><a href="/admin/investors/{viewer.viewerId}" class="block truncate text-sm font-medium">{viewer.email ?? 'Erased investor'}</a><p class="mt-1 truncate text-xs text-muted-foreground">{viewer.fileTitle ?? viewer.roomName}</p></div></li>{/each}</ul>
		{/if}
	</Card.Content>
</Card.Root>
