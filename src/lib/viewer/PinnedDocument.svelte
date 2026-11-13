<script lang="ts">
 import { ArrowUpRight, Download } from '@lucide/svelte';
 import type { Snippet } from 'svelte';
 import { formatBytes } from '#lib/admin/op.ts';
 import { Badge } from '#lib/components/ui/badge/index.js';

 let { name, kind, size, number, href, change, controls, version, hidden = false }: { name: string; kind: string | null; size: number | null; number: number; href?: string; change?: string | null; controls?: Snippet; version?: Snippet; hidden?: boolean } = $props();
 const labels: Record<string, string> = { pdf: 'PDF', image: 'Image', video: 'Video', download: 'Download' };
</script>
<li class={`@container/pin overflow-hidden rounded-xl border bg-card ${hidden ? 'hidden sm:block' : ''}`}>
 <div class="flex h-full flex-col @min-[440px]/pin:flex-row @min-[440px]/pin:flex-wrap @min-[440px]/pin:items-center">
  <a {href} aria-disabled={!href || undefined} role={!href ? 'link' : undefined} tabindex={!href ? -1 : undefined} class="group flex min-h-20 w-full min-w-0 flex-1 items-center gap-2 p-3 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring @min-[440px]/pin:w-auto @min-[440px]/pin:flex-1">
   <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-primary">{number}</span>
   <span class="min-w-0 flex-1"><span class="block break-words text-base font-semibold leading-snug [overflow-wrap:anywhere]">{name}</span>{#if change}<Badge variant="secondary" class="mt-1">{change === 'new' ? 'New' : 'Updated'}</Badge>{/if}<span class="mt-1 block text-xs text-muted-foreground">{labels[kind ?? 'download']} · {formatBytes(size)}</span></span>
   {#if kind === 'download'}<Download class="size-4 shrink-0 text-muted-foreground" aria-label="Download" />{:else}<ArrowUpRight class="size-4 shrink-0 text-muted-foreground" aria-label="Open document" />{/if}
  </a>
  {#if controls}<div class="flex w-full justify-end border-t px-2 @min-[440px]/pin:w-auto @min-[440px]/pin:border-t-0 @min-[440px]/pin:border-l">{@render controls()}</div>{/if}
  {#if version}<div class="w-full border-t px-3 pb-3">{@render version()}</div>{/if}
 </div>
</li>
