<script lang="ts">
 import { ChevronDown, Mail } from '@lucide/svelte';
 import { onMount, type Snippet } from 'svelte';
 import { renderedExcerpt } from '#lib/markdown.ts';
 import { cn } from '#lib/utils.js';

 let { name, html = '', personal = false, compact = false, tools, persistenceKey, revision }: { name: string; html?: string; personal?: boolean; compact?: boolean; tools?: Snippet; persistenceKey?: string; revision?: string } = $props();
 let chosenOpen = $state<boolean | null>(null);
 let compactOpen = $state(false);
 let disclosure = $state<HTMLDetailsElement>();
 const excerpt = $derived(renderedExcerpt(html));
 const open = $derived(chosenOpen ?? excerpt.length <= 600);
 onMount(() => {
  if (!persistenceKey || !revision) return;
  try {
   const saved = JSON.parse(sessionStorage.getItem(persistenceKey) ?? 'null');
   if (saved?.revision === revision && typeof saved.open === 'boolean') chosenOpen = saved.open;
  } catch {}
 });
 $effect(() => {
  const summary = disclosure?.querySelector('summary');
  summary?.addEventListener('click', toggle);
  return () => summary?.removeEventListener('click', toggle);
 });
 function toggle(event: MouseEvent) {
  event.preventDefault();
  if (compact) { compactOpen = !compactOpen; return; }
  chosenOpen = !open;
  if (persistenceKey && revision) try { sessionStorage.setItem(persistenceKey, JSON.stringify({ revision, open: chosenOpen })); } catch {}
 }
</script>

<div class="@container mb-5">
 {#if compact}<h1 class="sr-only">{name}</h1>{#if tools}{@render tools()}{/if}{/if}
 <section class={cn('overflow-hidden rounded-2xl border bg-card', compact && 'rounded-none border-0 bg-transparent')} aria-label={personal ? 'Personal welcome' : 'Room introduction'}>
  {#if !compact}<div class="bg-primary/5 px-4 pt-4 pb-3 @sm:px-6 @sm:pt-5"><p class="mb-2 text-xs font-semibold tracking-[0.12em] text-primary uppercase">{personal ? 'Prepared for you' : 'Welcome to our data room'}</p><h1 class="break-words text-2xl font-semibold tracking-tight @sm:text-3xl [overflow-wrap:anywhere]">{name}</h1></div>{/if}
  {#if html.trim()}
   <details bind:this={disclosure} open={compact ? compactOpen : open} class="group">
    <summary class={cn('min-h-11 cursor-pointer list-none px-4 py-3 text-sm @sm:px-6', compact && 'px-0 @sm:px-0')}><span class="flex items-center justify-between gap-2"><span class="flex items-center gap-2 font-semibold">{#if personal}<Mail class="size-4 shrink-0 text-primary" />{/if}{personal ? 'Personal welcome' : 'Welcome & introduction'}</span><span class="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium text-primary">{(compact ? compactOpen : open) ? 'Show less' : 'Read welcome'}<ChevronDown class="size-4 shrink-0 transition-transform group-open:rotate-180" /></span></span>{#if !open && !compact}<span class="mt-2 line-clamp-2 break-words text-muted-foreground [overflow-wrap:anywhere]">{excerpt}</span>{/if}</summary>
    <div class={cn('md px-4 pb-4 text-sm leading-relaxed @sm:px-6 @sm:pb-5 [&>:first-child]:mt-0 [&>:last-child]:mb-0', compact && 'px-0 @sm:px-0')}>{@html html}</div>
   </details>
  {:else if !compact}<p class="px-4 pb-4 text-sm text-muted-foreground @sm:px-6 @sm:pb-5">Explore the documents shared with you. Questions are always welcome.</p>{/if}
 </section>
 {#if !compact && tools}{@render tools()}{/if}
</div>
