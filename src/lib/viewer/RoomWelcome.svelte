<script lang="ts">
 import { ChevronDown, FolderClosed, Mail } from '@lucide/svelte';
 import { onMount, type Snippet } from 'svelte';
 import { renderedExcerpt } from '#lib/markdown.ts';

 let { name, html = '', personal = false, compact = false, homeHref, logoUrl, coverUrl, account, persistenceKey, revision }: { name: string; html?: string; personal?: boolean; compact?: boolean; homeHref?: string; logoUrl: string | null; coverUrl?: string | null; account?: Snippet; persistenceKey?: string; revision?: string } = $props();
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

<section class="room-cover @container/cover border-b" aria-label="Room introduction">
 <div class="relative mx-auto grid max-w-6xl items-center gap-3 px-4 py-4 @xl/cover:px-8 @xl/cover:py-6">
  <div class="flex flex-wrap items-start justify-between gap-2">
   <div class="flex min-w-0 flex-1 items-center gap-3 @xl/cover:gap-5">
    {#if logoUrl}<img src={logoUrl} alt="" class="max-h-12 w-auto max-w-24 object-contain @xl/cover:max-h-16 @xl/cover:max-w-40" />
    {:else}<span class="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-card/75 text-primary @xl/cover:size-14"><FolderClosed class="size-5 @xl/cover:size-7" strokeWidth={1.5} /></span>{/if}
    <h1 class="text-2xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] @xl/cover:text-4xl">{#if homeHref}<a href={homeHref} class="hover:text-primary">{name}</a>{:else}{name}{/if}</h1>
   </div>
   {#if account}{@render account()}{/if}
  </div>
  {#if !compact && coverUrl}<img src={coverUrl} alt="" class="h-20 w-full rounded-xl object-cover @xl/cover:h-36" />{/if}
  {#if html.trim()}
   <details bind:this={disclosure} open={compact ? compactOpen : open} class="group max-w-3xl text-sm">
    <summary class="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 font-medium text-primary">
     {#if personal}<Mail class="size-4" />{/if}{personal ? 'Personal welcome' : 'Welcome & introduction'}<span class="font-normal text-muted-foreground">{(compact ? compactOpen : open) ? 'Show less' : 'Read welcome'}</span><ChevronDown class="size-4 transition-transform group-open:rotate-180" />
     {#if !open && !compact}<span class="line-clamp-2 w-full text-sm font-normal text-muted-foreground [overflow-wrap:anywhere]">{excerpt}</span>{/if}
    </summary>
    <div class="md pb-1 text-sm leading-relaxed [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0">{@html html}</div>
   </details>
  {/if}
 </div>
</section>

<style>
 .room-cover {
  background: linear-gradient(110deg, color-mix(in srgb, var(--primary) 9%, var(--card)), var(--card) 85%);
 }
</style>
