<script lang="ts">
 import { ArrowUpRight, ChevronRight, Download } from '@lucide/svelte';
 import FileIcon from '#lib/admin/FileIcon.svelte';
 import { formatBytes } from '#lib/admin/op.ts';
 import { Badge } from '#lib/components/ui/badge/index.js';
 import { Button } from '#lib/components/ui/button/index.js';

 let { name, kind, size, number, folderPath, folder = false, childCount = 0, href, downloadHref, change, onfolder }: { name: string; kind: string | null; size: number | null; number?: string; folderPath?: string; folder?: boolean; childCount?: number; href?: string; downloadHref?: string; change?: string | null; onfolder?: () => void } = $props();
 const labels: Record<string, string> = { pdf: 'PDF', image: 'Image', video: 'Video', download: 'Download' };
</script>
<li class="flex items-center gap-3 px-4 py-3">
 <FileIcon {kind} {folder} />
 <div class="min-w-0 flex-1">
  {#if folder}<button type="button" class="flex min-h-11 w-full items-center break-words text-left text-sm font-medium hover:text-primary [overflow-wrap:anywhere]" onclick={onfolder}>{name}</button>{:else}<a {href} aria-disabled={!href || undefined} role={!href ? 'link' : undefined} tabindex={!href ? -1 : undefined} class="flex min-h-11 items-center text-sm font-medium hover:text-primary" title={name}><span class="break-words [overflow-wrap:anywhere]">{name}</span></a>{#if change}<Badge variant="secondary" class="mb-1">{change === 'new' ? 'New' : 'Updated'}</Badge>{/if}{/if}
  <p class="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{folder ? `${childCount} item${childCount === 1 ? '' : 's'}` : `${labels[kind ?? 'download']} · ${formatBytes(size)}`}</p>
  {#if !folder && (folderPath || number)}<p class="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{folderPath || `Section ${number}`}</p>{/if}
 </div>
 {#if folder}<button type="button" aria-label="Open {name}" class="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted" onclick={onfolder}><ChevronRight class="size-4" /></button>{:else if downloadHref}<Button href={downloadHref} variant="ghost" size="icon" class="size-11" aria-label="Download {name}"><Download /></Button>{:else if href}<a {href} class="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Read {name}"><ArrowUpRight class="size-4" /></a>{:else}<ArrowUpRight class="size-4 shrink-0 text-muted-foreground" />{/if}
</li>
