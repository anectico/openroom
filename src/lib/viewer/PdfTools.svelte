<script lang="ts">
 import { ChevronLeft, ChevronRight, Search, X } from '@lucide/svelte';
 import type { PDFDocumentProxy } from 'pdfjs-dist';
 import { onDestroy, tick, untrack } from 'svelte';
 import { Button } from '#lib/components/ui/button/index.js';
 import * as Dialog from '#lib/components/ui/dialog/index.js';
 import { Input } from '#lib/components/ui/input/index.js';
 import { cn } from '#lib/utils.js';
 import PdfThumbnail from './PdfThumbnail.svelte';
 import { normalizePdfText, searchExcerpt, textParts } from './pdf-text.ts';

 let { doc, mode, current, watermark = null, open = $bindable(false), onpage, onquery, onstate, onreturnfocus }: { doc: PDFDocumentProxy; mode: 'search' | 'pages'; current: number; watermark?: string | null; open?: boolean; onpage: (page: number) => void; onquery: (query: string) => void; onreturnfocus: () => void; onstate: (state: { count: number; active: number; busy: boolean }) => void } = $props();
 let query = $state(''), term = $state(''), busy = $state(false), scanned = $state(0);
 let matches = $state<{ page: number; snippet: string }[]>([]);
 let active = $state(-1), searched = $state(false), message = $state('');
 let start = $state(untrack(() => Math.floor((current - 1) / 8) * 8 + 1));
 let searchInput = $state<HTMLInputElement | null>(null);
 let searchPane = $state<HTMLDivElement>();
 let pagesPane = $state<HTMLDivElement>();
 let searchScroll = 0;
 const pageScroll = new Map<number, number>();
 async function restorePanel() {
  await tick();
  if (!open) return;
  const pane = mode === 'search' ? searchPane : pagesPane;
  if (!pane) return;
  pane.scrollTop = mode === 'search' ? searchScroll : pageScroll.get(start) ?? 0;
  const selected = pane.querySelector<HTMLElement>('[aria-current]');
  if (selected) {
   const top = selected.offsetTop, bottom = top + selected.offsetHeight;
   if (top < pane.scrollTop) pane.scrollTop = Math.max(0, top - 8);
   else if (bottom > pane.scrollTop + pane.clientHeight) pane.scrollTop = bottom - pane.clientHeight + 8;
  }
 }
 async function openPanel(event: Event) {
  event.preventDefault();
  await restorePanel();
  if (mode === 'search') searchInput?.focus({ preventScroll: true });
  else pagesPane?.querySelector<HTMLButtonElement>('[aria-current]')?.focus({ preventScroll: true });
 }
 async function changePages(next: number) { start = next; await restorePanel(); }
 let generation = 0;
 const cache = new Map<number, string>();
 const pages = $derived(Array.from({ length: Math.min(8, doc.numPages - start + 1) }, (_, i) => start + i));
 $effect(() => { onstate({ count: matches.length, active, busy }); });
 $effect(() => { if (open && mode === 'pages') start = Math.floor((current - 1) / 8) * 8 + 1; });
 onDestroy(() => { generation++; });
 export function previousResult() { if (active > 0) void select(active - 1); }
 export function nextResult() { if (active < matches.length - 1) void select(active + 1); }
 export function clearSearch() { generation++; query = term = ''; matches = []; active = -1; busy = searched = false; message = ''; onquery(''); }
 async function search(event: SubmitEvent) {
  event.preventDefault();
  const needle = normalizePdfText(query).trim(), run = ++generation;
  searchScroll = 0; if (searchPane) searchPane.scrollTop = 0;
  term = query.trim(); onquery(term); matches = []; active = -1; scanned = 0; message = ''; searched = !!needle;
  if (!needle) { busy = false; return; }
  busy = true;
  let textPages = 0;
  try {
   for (let number = 1; number <= doc.numPages; number++) {
    let text = cache.get(number);
    if (text === undefined) {
     const page = await doc.getPage(number), content = await page.getTextContent();
     text = content.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ');
     if (run !== generation) return;
     cache.set(number, text); const oldest = cache.keys().next().value;
     if (cache.size > 200 && oldest !== undefined) cache.delete(oldest);
    }
    if (run !== generation) return;
    if (text.trim()) textPages++;
    if (normalizePdfText(text).includes(needle)) matches = [...matches, { page: number, snippet: searchExcerpt(text, term) }];
    scanned = number;
    if (matches.length >= 500) { message = 'Showing the first 500 matching pages. Refine your search for more specific results.'; break; }
    await new Promise((resolve) => setTimeout(resolve, 0));
   }
   if (!textPages) message = 'This PDF has no searchable text. It may contain scanned images; OCR is not available.';
  } catch { if (run === generation) message = 'Some pages could not be searched. Check your connection and search again.'; }
  finally { if (run === generation) busy = false; }
 }
 async function go(number: number) { open = false; await tick(); onpage(number); }
 async function select(index: number) { active = index; await go(matches[index].page); }
</script>
<svelte:window onresize={() => { if (open) void restorePanel(); }} />
<Dialog.Root bind:open>
 <Dialog.Content class="flex max-h-[86dvh] flex-col gap-4 p-4 sm:max-w-3xl" showCloseButton={false} onOpenAutoFocus={openPanel} onCloseAutoFocus={(event) => { event.preventDefault(); onreturnfocus(); }}>
  <Dialog.Header class="shrink-0 text-left"><div class="flex items-center justify-between gap-2"><Dialog.Title>{mode === 'search' ? 'Search this document' : 'Page thumbnails'}</Dialog.Title><Button variant="ghost" size="icon" class="size-11" aria-label="Close PDF tools" onclick={() => (open = false)}><X /></Button></div><Dialog.Description>{mode === 'search' ? 'Search words or a phrase in this PDF.' : `Current page ${current} of ${doc.numPages}. Choose a page to continue reading.`}</Dialog.Description></Dialog.Header>
  {#if mode === 'search'}
   <form class="flex shrink-0 gap-2" onsubmit={search}><Input bind:ref={searchInput} aria-label="Find in document" class="min-h-11 min-w-0 flex-1" maxlength={200} bind:value={query} placeholder="Words or phrase…" /><Button type="submit" class="min-h-11" disabled={!query.trim()}><Search data-icon="inline-start" />Search</Button></form>
   <div class="flex shrink-0 flex-wrap items-center justify-between gap-2"><p class="text-xs text-muted-foreground" role="status">{busy ? `Searching page ${scanned} of ${doc.numPages}…` : searched ? `${matches.length} matching page${matches.length === 1 ? '' : 's'}${active >= 0 ? ` · Selected page ${matches[active].page}` : ''}` : 'Results will appear below.'}</p>{#if busy}<Button variant="ghost" class="min-h-11" onclick={() => { generation++; busy = false; message = `Search stopped after ${scanned} pages. Results may be incomplete.`; }}>Stop search</Button>{/if}</div>
   <div bind:this={searchPane} onscroll={(event) => (searchScroll = event.currentTarget.scrollTop)} class="relative min-h-0 overflow-y-auto overscroll-contain">
    {#if message}<p class="mb-3 text-sm text-muted-foreground" role="status">{message}</p>{/if}
    {#if searched && !busy && !matches.length && !message}<p class="text-sm text-muted-foreground">No matches. Try another word or phrase.</p>{/if}
    {#if matches.length}<ol class="divide-y rounded-lg border">{#each matches as result, index (result.page)}<li><button type="button" class={cn('flex min-h-16 w-full flex-col gap-1 p-3 text-left hover:bg-muted/40', active === index && 'bg-primary/10')} aria-current={active === index ? 'true' : undefined} aria-label="Search result on page {result.page}" onclick={() => select(index)}><span class="text-xs font-semibold text-primary">Page {result.page}{active === index ? ' · Selected' : ''}</span><span class="line-clamp-3 break-words text-sm [overflow-wrap:anywhere]">{#each textParts(result.snippet, term) as part}{#if part.match}<mark class="rounded-sm bg-search-match text-search-match-foreground">{part.text}</mark>{:else}{part.text}{/if}{/each}</span></button></li>{/each}</ol>{/if}
   </div>
  {:else}
   <div bind:this={pagesPane} onscroll={(event) => pageScroll.set(start, event.currentTarget.scrollTop)} class="relative grid min-h-0 grid-cols-2 gap-3 overflow-y-auto overscroll-contain sm:grid-cols-4">{#each pages as number (number)}<PdfThumbnail {doc} {number} {watermark} selected={current === number} onselect={() => go(number)} onready={() => { if (open && mode === 'pages') void restorePanel(); }} />{/each}</div>
   <div class="flex shrink-0 items-center justify-between gap-2"><Button variant="outline" class="min-h-11" disabled={start === 1} onclick={() => changePages(Math.max(1, start - 8))}><ChevronLeft data-icon="inline-start" />Previous</Button><span class="text-xs text-muted-foreground">{start}–{Math.min(start + 7, doc.numPages)} of {doc.numPages}</span><Button variant="outline" class="min-h-11" disabled={start + 8 > doc.numPages} onclick={() => changePages(start + 8)}>Next<ChevronRight data-icon="inline-end" /></Button></div>
  {/if}
 </Dialog.Content>
</Dialog.Root>
