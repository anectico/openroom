<script lang="ts">
 import { ChevronDown } from '@lucide/svelte';
 import { onMount } from 'svelte';
 import { renderedExcerpt } from '#lib/markdown.ts';

 let { html = '', personal = false, homeHref, coverUrl, persistenceKey, revision, cookieName, savedOpen = null }: { html?: string; personal?: boolean; homeHref?: string; coverUrl?: string | null; persistenceKey?: string; revision?: string; cookieName?: string | null; savedOpen?: boolean | null } = $props();
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

{#if html.trim() || coverUrl}
<section class="room-cover mb-4 overflow-hidden rounded-xl border sm:mb-5" aria-label="Room introduction">
  {#if coverUrl}<img src={coverUrl} alt="" class="h-20 w-full object-cover sm:h-36" />{/if}
  {#if html.trim()}
   <div class="max-w-3xl px-4 sm:px-5">
    <details bind:this={disclosure} open={expanded} class="group flex flex-col text-sm">
     <summary aria-label={`${expanded ? 'Hide' : 'Show'} ${personal ? 'personal welcome' : 'welcome'}`} class="order-last inline-flex min-h-11 min-w-11 cursor-pointer self-start list-none items-center gap-1.5 rounded-md text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
      {expanded ? 'Hide' : 'Show welcome'}<ChevronDown aria-hidden="true" class="size-3.5 group-open:rotate-180" />
     </summary>
     <div class="md flow-root pt-4 text-sm leading-relaxed [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0">{@html html}</div>
    </details>
    {#if !expanded && preference === null}<p class="mb-3 line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{excerpt}</p>{/if}
   </div>
  {/if}
</section>
{/if}

<style>
 .room-cover {
  background: linear-gradient(110deg, color-mix(in srgb, var(--primary) 9%, var(--card)), var(--card) 85%);
 }
</style>
