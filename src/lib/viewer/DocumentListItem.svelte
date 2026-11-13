<script lang="ts">
 import { ArrowUpRight, ChevronRight, Download } from '@lucide/svelte';
 import FileIcon from '#lib/admin/FileIcon.svelte';
 import { formatBytes } from '#lib/admin/op.ts';
 import { Badge } from '#lib/components/ui/badge/index.js';
 import { Button } from '#lib/components/ui/button/index.js';

 let { name, kind, size, number, folderPath, folder = false, childCount = 0, href, downloadHref, change, onfolder }: { name: string; kind: string | null; size: number | null; number?: string; folderPath?: string; folder?: boolean; childCount?: number; href?: string; downloadHref?: string; change?: string | null; onfolder?: () => void } = $props();
 const labels: Record<string, string> = { pdf: 'PDF', image: 'Image', video: 'Video', download: 'Download' };
</script>
{#snippet documentLabel()}
 <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><span class="break-words text-sm font-medium [overflow-wrap:anywhere]">{name}</span>{#if change && !folder}<Badge variant="secondary">{change === 'new' ? 'New' : 'Updated'}</Badge>{/if}</span>
 <span class="flex flex-wrap gap-x-2 text-xs text-muted-foreground [overflow-wrap:anywhere]"><span>{folder ? `${childCount} item${childCount === 1 ? '' : 's'}` : `${labels[kind ?? 'download']} · ${formatBytes(size)}`}</span>{#if !folder && (folderPath || number)}<span>· {folderPath || `Section ${number}`}</span>{/if}</span>
{/snippet}
<li class="flex items-center gap-3 px-4 py-2">
 <FileIcon {kind} {folder} />
 <div class="min-w-0 flex-1">
  {#if folder}<button type="button" class="flex min-h-11 w-full flex-col justify-center gap-1 text-left hover:text-primary" onclick={onfolder}>{@render documentLabel()}</button>{:else}<a {href} aria-disabled={!href || undefined} role={!href ? 'link' : undefined} tabindex={!href ? -1 : undefined} class="flex min-h-11 flex-col justify-center gap-1 hover:text-primary" title={name}>{@render documentLabel()}</a>{/if}
 </div>
 {#if folder}<button type="button" aria-label="Open {name}" class="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted" onclick={onfolder}><ChevronRight class="size-4" /></button>{:else if downloadHref}<Button href={downloadHref} variant="ghost" size="icon" class="size-11" aria-label="Download {name}"><Download /></Button>{:else if href}<a {href} class="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Read {name}"><ArrowUpRight class="size-4" /></a>{:else}<ArrowUpRight class="size-4 shrink-0 text-muted-foreground" />{/if}
</li>
