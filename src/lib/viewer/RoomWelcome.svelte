<script lang="ts">
 import { ChevronDown, FolderClosed } from '@lucide/svelte';
 import { onMount, type Snippet } from 'svelte';
 import { renderedExcerpt } from '#lib/markdown.ts';

 let { name, html = '', personal = false, homeHref, logoUrl, coverUrl, account, persistenceKey, revision, cookieName, savedOpen = null }: { name: string; html?: string; personal?: boolean; homeHref?: string; logoUrl: string | null; coverUrl?: string | null; account?: Snippet; persistenceKey?: string; revision?: string; cookieName?: string | null; savedOpen?: boolean | null } = $props();
 let chosenOpen = $state<boolean | null>(null);
 let disclosure = $state<HTMLDetailsElement>();
 const excerpt = $derived(renderedExcerpt(html));
 const preference = $derived(chosenOpen ?? savedOpen);
 const expanded = $derived(preference ?? excerpt.length <= 600);
 onMount(() => {
  if (savedOpen !== null || !persistenceKey || !revision) return;
  try {
   const saved = JSON.parse(sessionStorage.getItem(persistenceKey) ?? 'null');
   if (saved?.revision === revision && typeof saved.open === 'boolean') {
    chosenOpen = saved.open;
    if (cookieName) remember(saved.open);
   }
  } catch {}
 });
 $effect(() => {
  const summary = disclosure?.querySelector('summary');
  summary?.addEventListener('click', toggle);
  return () => summary?.removeEventListener('click', toggle);
 });
 function remember(value: boolean) {
  if (!revision) return;
  if (cookieName && homeHref) try {
   document.cookie = `${cookieName}=${revision}.${value ? 'open' : 'closed'}; Path=${homeHref}; Max-Age=34560000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {}
  if (persistenceKey) try { sessionStorage.setItem(persistenceKey, JSON.stringify({ revision, open: value })); } catch {}
 }
 function toggle(event: MouseEvent) {
  event.preventDefault();
  chosenOpen = !expanded;
  remember(chosenOpen);
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
  {#if coverUrl}<img src={coverUrl} alt="" class="h-20 w-full rounded-xl object-cover @xl/cover:h-36" />{/if}
  {#if html.trim()}
   <div class="max-w-3xl">
    <details bind:this={disclosure} open={expanded} class="group flex flex-col text-sm">
     <summary aria-label={`${expanded ? 'Hide' : 'Show'} ${personal ? 'personal welcome' : 'welcome'}`} class="order-last inline-flex min-h-11 min-w-11 cursor-pointer self-start list-none items-center gap-1.5 rounded-md text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
      {expanded ? 'Hide' : 'Show welcome'}<ChevronDown aria-hidden="true" class="size-3.5 group-open:rotate-180" />
     </summary>
     <div class="md flow-root text-sm leading-relaxed [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0">{@html html}</div>
    </details>
    {#if !expanded && preference === null}<p class="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{excerpt}</p>{/if}
   </div>
  {/if}
 </div>
</section>

<style>
 .room-cover {
  background: linear-gradient(110deg, color-mix(in srgb, var(--primary) 9%, var(--card)), var(--card) 85%);
 }
</style>
