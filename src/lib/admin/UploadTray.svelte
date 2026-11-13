<script lang="ts">
	import { Check, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Upload, X } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { uploads } from './uploads.svelte.ts';

	let { rooms }: { rooms: { id: string; name: string }[] } = $props();
	let expanded = $state(true);
	const total = $derived(uploads.items.length);
	const done = $derived(uploads.items.filter((item) => item.status === 'done').length);
	const failed = $derived(uploads.items.filter((item) => item.status === 'failed').length);
	const active = $derived(total - done - failed);
	const bytes = $derived(uploads.items.reduce((sum, item) => sum + item.file.size, 0));
	const sent = $derived(uploads.items.reduce((sum, item) => sum + item.file.size * (item.status === 'done' ? 1 : item.progress), 0));
	const progress = $derived(bytes ? Math.min(100, Math.round(sent / bytes * 100)) : 0);
	const title = $derived(active ? 'Uploading files' : failed ? 'Uploads need attention' : 'Uploads complete');
	const ordered = $derived([...uploads.items].sort((a, b) => {
		const order = { sending: 0, failed: 1, waiting: 2, done: 3 };
		return order[a.status] - order[b.status] || a.id - b.id;
	}));
	let previousTotal = 0;
	let previousActive = 0;
	$effect(() => {
		if (total > previousTotal || (active > 0 && previousActive === 0)) expanded = true;
		else if (previousActive > 0 && !active && !failed) expanded = false;
		previousTotal = total;
		previousActive = active;
	});
	const destination = (target: (typeof uploads.items)[number]['target']) => target.kind === 'version'
		? 'New version'
		: rooms.find((room) => room.id === target.roomId)?.name ?? 'Data room';
</script>

{#if total}
	<section class="fixed right-4 bottom-4 z-40 w-96 max-w-[calc(100vw-2rem)]" aria-label="File uploads">
	<Card.Root class="gap-0 overflow-hidden py-0 shadow-lg">
		<Card.Header class="flex flex-row items-center gap-2 px-3 py-2">
			<button type="button" class="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded} aria-controls="upload-details" onclick={() => expanded = !expanded}>
				{#if active}<LoaderCircle class="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" />{:else if failed}<CircleAlert class="size-5 shrink-0 text-destructive" />{:else}<Check class="size-5 shrink-0 text-primary" />{/if}
				<span class="min-w-0"><span class="block text-sm font-medium" role="status">{title}</span><span class="mt-0.5 block text-xs text-muted-foreground">{done} of {total} complete{#if failed} · {failed} failed{:else if active} · {progress}%{/if}</span></span>
			</button>
			<Button variant="ghost" size="icon" class="size-11" aria-label={expanded ? 'Minimize uploads' : 'Expand uploads'} aria-expanded={expanded} aria-controls="upload-details" onclick={() => expanded = !expanded}>{#if expanded}<ChevronDown />{:else}<ChevronUp />{/if}</Button>
			{#if !active && !failed}<Button variant="ghost" size="icon" class="size-11" aria-label="Dismiss completed uploads" onclick={() => uploads.clearDone()}><X /></Button>{/if}
		</Card.Header>
		{#if active}<Progress value={progress} aria-label="Total upload progress" class="h-1 rounded-none" />{/if}
		<div id="upload-details" hidden={!expanded}>
			<Card.Content class="max-h-[min(42dvh,320px)] overflow-y-auto border-t px-4 py-0">
				<ul class="divide-y">{#each ordered as item (item.id)}<li class="flex flex-col gap-1.5 py-3"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="truncate text-xs font-medium" title={item.file.name}>{item.file.name}</p><p class="mt-1 truncate text-[11px] text-muted-foreground">{destination(item.target)}</p></div>{#if item.status === 'failed'}<Button variant="outline" size="sm" class="min-h-10" onclick={() => uploads.retry(item.id)} aria-label="Retry {item.file.name}">Retry</Button>{:else}<span class="shrink-0 text-xs tabular-nums text-muted-foreground">{item.status === 'done' ? 'Done' : item.status === 'waiting' ? 'Queued' : `${Math.round(item.progress * 100)}%`}</span>{/if}</div>{#if item.error}<p class="text-xs break-words text-destructive">{item.error}</p>{/if}</li>{/each}</ul>
			</Card.Content>
			{#if done || failed}<Card.Footer class="justify-between gap-2 border-t px-3 py-2">{#if done}<Button variant="ghost" size="sm" class="min-h-10" onclick={() => uploads.clearDone()}>Clear completed</Button>{/if}{#if failed}<Button variant="outline" size="sm" class="ml-auto min-h-10" onclick={() => { for (const item of uploads.items) if (item.status === 'failed') uploads.retry(item.id); }}><Upload data-icon="inline-start" />Retry failed</Button>{/if}</Card.Footer>{/if}
		</div>
	</Card.Root>
	</section>
{/if}
