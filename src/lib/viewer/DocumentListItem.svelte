<script lang="ts">
 import { ArrowUpRight, ChevronRight, Download } from '@lucide/svelte';
 import FileIcon from '#lib/admin/FileIcon.svelte';
 import { formatBytes } from '#lib/admin/op.ts';
 import { Badge } from '#lib/components/ui/badge/index.js';
 import { Button } from '#lib/components/ui/button/index.js';

 let { name, kind, size, folderPath, folder = false, childCount = 0, href, downloadHref, previewDownload = false, change, onfolder, updatedAt }: { updatedAt?: number | null; name: string; kind: string | null; size: number | null; folderPath?: string; folder?: boolean; childCount?: number; href?: string; downloadHref?: string; previewDownload?: boolean; change?: string | null; onfolder?: () => void } = $props();
 const labels: Record<string, string> = { pdf: 'PDF', image: 'Image', video: 'Video', download: 'Download' };
 let updatedLabel = $state('');
 $effect(() => { updatedLabel = updatedAt ? new Date(updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''; });
</script>
{#snippet documentLabel()}
 <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><span class="break-words text-sm font-medium [overflow-wrap:anywhere]">{name}</span>{#if change && !folder}<Badge variant="secondary">{change === 'new' ? 'New' : 'Updated'}</Badge>{/if}</span>
 {#if folder}
  <span class="flex flex-wrap gap-x-2 text-xs text-muted-foreground [overflow-wrap:anywhere]"><span>{childCount} item{childCount === 1 ? '' : 's'}</span>{#if folderPath}<span>· {folderPath}</span>{/if}</span>
 {:else}
  <span class="whitespace-nowrap text-right text-xs text-muted-foreground">{labels[kind ?? 'download']} · {formatBytes(size)}</span>
  {#if updatedAt}<span class="col-span-full text-xs text-muted-foreground">Updated <time datetime={new Date(updatedAt).toISOString()}>{updatedLabel || new Date(updatedAt).toISOString().slice(0, 10)}</time></span>{/if}
  {#if folderPath}<span class="col-span-full text-xs text-muted-foreground [overflow-wrap:anywhere]">{folderPath}</span>{/if}
 {/if}
{/snippet}
<li class="@container/item flex min-w-0 items-center gap-2 px-3 py-2 sm:gap-3 sm:rounded-xl sm:border sm:bg-card sm:px-4 sm:only:max-w-xl">
 <FileIcon {kind} {folder} />
 <div class="min-w-0 flex-1">
  {#if folder}<button type="button" class="document-label" onclick={onfolder}>{@render documentLabel()}</button>{:else}<a {href} aria-disabled={!href || undefined} role={!href ? 'link' : undefined} tabindex={!href ? -1 : undefined} class="document-label" title={name}>{@render documentLabel()}</a>{/if}
 </div>
 {#if folder}<button type="button" aria-label="Open {name}" class="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted" onclick={onfolder}><ChevronRight class="size-4" /></button>{:else if downloadHref || previewDownload}<Button href={downloadHref} disabled={previewDownload} variant="ghost" size="icon" class="size-11" aria-label="Download {name}"><Download /></Button>{:else if href}<a {href} class="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Read {name}"><ArrowUpRight class="size-4" /></a>{:else}<ArrowUpRight class="size-4 shrink-0 text-muted-foreground" />{/if}
</li>

<style>
 .document-label {
  display: flex;
  width: 100%;
  min-height: 2.75rem;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
  text-align: left;
 }

 a.document-label {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  align-content: center;
  column-gap: 0.5rem;
 }

 .document-label:hover { color: var(--primary); }

 @container item (min-width: 400px) {
  button.document-label {
   flex-flow: row wrap;
   align-items: baseline;
   align-content: center;
   justify-content: flex-start;
   column-gap: 0.5rem;
  }
 }
</style>
