<script lang="ts">
 import { ChevronDown } from '@lucide/svelte';
	import { onMount, type Snippet } from 'svelte';
 import { renderedExcerpt } from '#lib/markdown.ts';
 import { cn } from '#lib/utils.js';

	let { name, html = '', personal = false, compact = false, tools, persistenceKey, revision }: { name: string; html?: string; personal?: boolean; compact?: boolean; tools?: Snippet; persistenceKey?: string; revision?: string } = $props();
let details = $state<HTMLDetailsElement>();
let open = $state(false);
 const excerpt = $derived(renderedExcerpt(html));
 onMount(() => {
  if (!persistenceKey || !revision || !details) return;
  try {
   const saved = JSON.parse(sessionStorage.getItem(persistenceKey) ?? 'null');
   if (saved?.revision === revision) open = typeof saved.open === 'boolean' ? saved.open : false;
   sessionStorage.setItem(persistenceKey, JSON.stringify({ revision, ...(saved?.revision === revision && typeof saved.open === 'boolean' ? { open: saved.open } : {}) }));
  } catch {}
  const summary = details.querySelector('summary');
  summary?.addEventListener('click', remember);
  return () => summary?.removeEventListener('click', remember);
 });
 function remember() {
  if (persistenceKey && revision && details) try { sessionStorage.setItem(persistenceKey, JSON.stringify({ revision, open: !open })); } catch {}
 }
</script>

<div class="@container mb-4 sm:mb-5">
	{#if !compact}<p class="mb-2 hidden @sm:block text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">Prepared for your review</p>
	<h1 class="break-words text-xl font-semibold tracking-tight @sm:text-3xl">{name}</h1>{:else}<h1 class="sr-only">{name}</h1>{/if}
	{#if tools}{@render tools()}{/if}
	{#if html.trim()}
		<details bind:this={details} bind:open class={cn("group mt-3 rounded-xl border bg-card", compact && "border-0 bg-transparent")}>
			<summary class="min-h-11 cursor-pointer list-none px-3 py-2.5 text-sm @sm:px-4"><span class="flex items-center justify-between gap-2"><span class="font-medium">{personal ? 'A note for you' : 'Welcome & introduction'}</span><ChevronDown class="size-4 shrink-0 transition-transform group-open:rotate-180" /></span>{#if !open && !compact}<span class="mt-1 line-clamp-2 break-words text-muted-foreground [overflow-wrap:anywhere]">{excerpt}</span>{/if}{#if !compact}<span class="mt-1 block text-xs font-medium text-primary underline underline-offset-4">{open ? 'Show less' : 'Read full welcome'}</span>{/if}</summary>
			<div class="md border-t px-4 py-4 text-sm leading-relaxed">{@html html}</div>
		</details>
	{:else if !compact}
		<p class="mt-2 text-sm text-muted-foreground">Explore the documents shared with you. Questions are always welcome.</p>
	{/if}
</div>
