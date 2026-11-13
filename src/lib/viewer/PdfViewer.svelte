<script lang="ts">
	import { ChevronLeft, ChevronRight, Ellipsis, Grid2X2, Minus, Plus, Search, X } from '@lucide/svelte';
	import type { PDFDocumentProxy, TextLayer } from 'pdfjs-dist';
	import { onDestroy, onMount, type Snippet, tick, untrack } from 'svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import PdfTools from './PdfTools.svelte';
	import { highlightPdfText } from './pdf-text.ts';
	import { readingPlaces, rememberPage } from './reading.ts';
	import Watermark from './Watermark.svelte';

	let {
		url,
		readingScope,
		fileId,
		version = 1,
		initialPage = null,
		watermark = null,
		onpage,
		actions,
		navigation,
	}: { url: string; readingScope?: string; fileId?: string; version?: number; initialPage?: number | null; watermark?: string | null; onpage?: (page: number) => void; actions?: Snippet; navigation?: Snippet } = $props();

	let host = $state<HTMLDivElement>();
	let doc = $state.raw<PDFDocumentProxy | null>(null);
	let TextLayerClass: typeof import('pdfjs-dist').TextLayer | null = null;
	const textLayers = new Map<number, TextLayer>();
	let toolsMode = $state<'search' | 'pages'>('search');
	let toolsOpen = $state(false);
	let toolbar = $state<HTMLElement>();
	let pdfTools = $state<{ previousResult(): void; nextResult(): void; clearSearch(): void }>();
	let searchState = $state({ count: 0, active: -1, busy: false });
	let toolsTrigger: HTMLElement | null = null;
	let searchTerm = $state('');
	let textError = $state('');
	$effect(() => { const query = searchTerm; for (const layer of host?.querySelectorAll<HTMLElement>('.pdf-text-layer') ?? []) highlightPdfText(layer, query); });
	function showTools(mode: 'search' | 'pages') { const active = document.activeElement instanceof HTMLElement ? document.activeElement : null; toolsTrigger = active?.closest('[role="menu"]') ? toolbar?.querySelector<HTMLElement>('[aria-label="Reader options"]') ?? null : active; toolsMode = mode; toolsOpen = true; }
	let loadingTask: { destroy: () => Promise<void> } | null = null;
	let sizes = $state<{ width: number; height: number }[]>([]);
	let total = $state(0);
	let ready = $state(false);
	let resumed = $state(0);
	let current = $state(1);
	let zoom = $state(1);
	let fit = $state(1);
	let jump = $state('1');
	let error = $state('');
	let loading = $state(true);
	const rendered = new Map<number, number>();
	const tasks = new Map<number, { cancel: () => void }>();
	let observer: IntersectionObserver | null = null;
	let destroyed = false;
	const keepAround = 3;
	const maxPixels = 16_000_000;
	let frame = 0;
	let quietUntil = 0;
	let firstWidth = 0;
	let resizer: ResizeObserver | null = null;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	const fitFor = () => Math.max(0.1, ((host?.clientWidth ?? 800) - 16) / firstWidth);

	const scale = $derived(fit * zoom);

	$effect(() => {
		if (!ready) return;
		onpage?.(current);
		if (readingScope && fileId) rememberPage(readingScope, { fileId, version, page: current });
	});

	$effect(() => { const page = initialPage; if (ready && page && page > 0) untrack(() => goTo(page)); });

	onMount(async () => {
		try {
			const pdfjs = await import('pdfjs-dist');
			TextLayerClass = pdfjs.TextLayer;
			const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
			pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
			if (destroyed) return;
			const task = pdfjs.getDocument({
				url,
				rangeChunkSize: 1 << 20,
				disableAutoFetch: true,
				cMapUrl: '/pdfjs/cmaps/',
				cMapPacked: true,
				standardFontDataUrl: '/pdfjs/standard_fonts/',
				wasmUrl: '/pdfjs/wasm/',
				iccUrl: '/pdfjs/iccs/',
			});
			loadingTask = task;
			doc = await task.promise;
			total = doc.numPages;
			const first = (await doc.getPage(1)).getViewport({ scale: 1 });
			sizes = Array.from({ length: total }, () => ({ width: first.width, height: first.height }));
			firstWidth = first.width;
			fit = fitFor();
			loading = false;
			await tick();
			observe();
			const saved = readingScope && fileId ? readingPlaces(readingScope).find((p) => p.fileId === fileId && p.version === version) : null;
			if (initialPage && initialPage > 0) goTo(initialPage);
			else if (saved && saved.page > 1) {
				resumed = Math.min(saved.page, total);
				goTo(resumed);
			}
			ready = true;
			if (host) {
				resizer = new ResizeObserver(() => {
					if (resizeTimer) clearTimeout(resizeTimer);
					resizeTimer = setTimeout(refit, 150);
				});
				resizer.observe(host);
			}
		} catch {
			error = 'This document could not be opened.';
			loading = false;
		}
	});

	onDestroy(() => {
		destroyed = true;
		observer?.disconnect();
		if (frame) cancelAnimationFrame(frame);
		resizer?.disconnect();
		if (resizeTimer) clearTimeout(resizeTimer);
		for (const t of tasks.values()) t.cancel();
		for (const layer of textLayers.values()) layer.cancel();
		void loadingTask?.destroy();
	});

	function observe() {
		observer?.disconnect();
		observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) void render(Number((e.target as HTMLElement).dataset.page));
			},
			{ rootMargin: '600px 0px' },
		);
		for (const el of host?.querySelectorAll<HTMLElement>('[data-page]') ?? []) observer.observe(el);
	}

	function pick() {
		frame = 0;
		if (destroyed || !host || performance.now() < quietUntil) return;
		const bottom = window.innerHeight;
		const atEnd = window.scrollY + bottom >= document.documentElement.scrollHeight - 2;
		let best = 0;
		let shown = 0;
		for (const el of host.querySelectorAll<HTMLElement>('[data-page]')) {
			const r = el.getBoundingClientRect();
			if (r.bottom <= 0) continue;
			if (r.top >= bottom) break;
			const px = Math.min(r.bottom, bottom) - Math.max(r.top, 0);
			if (px > shown) {
				shown = px;
				best = Number(el.dataset.page);
			}
		}
		const last = host.querySelector<HTMLElement>(`[data-page="${total}"]`)?.getBoundingClientRect();
		if (atEnd && last && last.bottom <= bottom + 2) best = total;
		if (best && best !== current) {
			current = best;
			jump = String(best);
		}
	}

	function scrolled() {
		if (!frame) frame = requestAnimationFrame(pick);
	}

	function release(n: number) {
		textLayers.get(n)?.cancel();
		textLayers.delete(n);
		host?.querySelector(`[data-page="${n}"] .pdf-text-layer`)?.replaceChildren();
		tasks.get(n)?.cancel();
		tasks.delete(n);
		rendered.delete(n);
		const canvas = host?.querySelector<HTMLCanvasElement>(`[data-page="${n}"] canvas`);
		if (canvas) {
			canvas.width = 0;
			canvas.height = 0;
		}
	}

	async function render(n: number) {
		if (!doc || rendered.get(n) === scale) return;
		const wanted = scale;
		textLayers.get(n)?.cancel();
		textLayers.delete(n);
		rendered.set(n, wanted);
		tasks.get(n)?.cancel();
		for (const other of [...rendered.keys()]) if (Math.abs(other - n) > keepAround * 2 && Math.abs(other - current) > keepAround) release(other);
		const page = await doc.getPage(n);
		if (rendered.get(n) !== wanted) return;
		const base = page.getViewport({ scale: wanted });
		const density = Math.min(window.devicePixelRatio || 1, Math.sqrt(maxPixels / (base.width * base.height)));
		const viewport = page.getViewport({ scale: wanted * density });
		sizes[n - 1] = { width: base.width / wanted, height: base.height / wanted };
		const canvas = host?.querySelector<HTMLCanvasElement>(`[data-page="${n}"] canvas`);
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);
		const task = page.render({ canvasContext: context, viewport, canvas });
		tasks.set(n, task);
		try {
			await task.promise;
			if (destroyed || rendered.get(n) !== wanted) return;
			const container = host?.querySelector<HTMLElement>(`[data-page="${n}"] .pdf-text-layer`);
			if (container && TextLayerClass) {
				try {
					const content = await page.getTextContent();
					if (destroyed || rendered.get(n) !== wanted) return;
					container.replaceChildren();
					const layer = new TextLayerClass({ textContentSource: content, container, viewport: base });
					textLayers.set(n, layer);
					await layer.render();
					highlightPdfText(container, searchTerm);
				} catch { if (!destroyed && rendered.get(n) === wanted) textError = 'Some text could not be loaded. Reload the document to try again.'; }
			}
		} catch {
			rendered.delete(n);
		}
	}

	async function refit() {
		if (destroyed || !firstWidth) return;
		const next = fitFor();
		if (Math.abs(next - fit) < 0.01) return;
		const page = current;
		fit = next;
		rendered.clear();
		await tick();
		observe();
		if (!toolsOpen) goTo(page);
	}

	async function setZoom(next: number) {
		zoom = Math.min(4, Math.max(0.5, next));
		rendered.clear();
		await tick();
		observe();
		goTo(current);
	}

	function goTo(n: number) {
		if (!total) return;
		if (!Number.isFinite(n)) { jump = String(current); return; }
		const page = Math.min(total, Math.max(1, Math.trunc(n)));
		quietUntil = performance.now() + 200;
		const target = host?.querySelector(`[data-page="${page}"]`);
		if (target) window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - (toolbar?.getBoundingClientRect().height ?? 100) - 12, behavior: 'instant' });
		current = page;
		jump = String(page);
	}

	function keys(event: KeyboardEvent) {
		if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); void showTools('search'); return; }
		if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
		if (event.key === 'ArrowRight' || event.key === 'PageDown') goTo(current + 1);
		else if (event.key === 'ArrowLeft' || event.key === 'PageUp') goTo(current - 1);
		else return;
		event.preventDefault();
	}
</script>

<svelte:window onkeydown={keys} onscrollcapture={scrolled} onresize={scrolled} />

{#if resumed}<p class="mb-2 text-xs text-muted-foreground" role="status">Resumed at page {resumed} · saved in this tab</p>{/if}

{#snippet zoomMenu()}
<DropdownMenu.Root><DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon', class: 'size-11' })} aria-label="Reader options"><Ellipsis /></DropdownMenu.Trigger><DropdownMenu.Content align="end" class="min-w-48"><DropdownMenu.Group><DropdownMenu.GroupHeading>Page {current} of {total}</DropdownMenu.GroupHeading><DropdownMenu.Item class="min-h-11" disabled={current <= 1} onSelect={() => goTo(current - 1)}><ChevronLeft />Previous page</DropdownMenu.Item><DropdownMenu.Item class="min-h-11" disabled={current >= total} onSelect={() => goTo(current + 1)}><ChevronRight />Next page</DropdownMenu.Item><DropdownMenu.Item class="min-h-11" onSelect={() => showTools('pages')}><Grid2X2 />Page thumbnails</DropdownMenu.Item></DropdownMenu.Group><DropdownMenu.Separator /><DropdownMenu.Group><DropdownMenu.GroupHeading>Zoom · {Math.round(zoom * 100)}%</DropdownMenu.GroupHeading><DropdownMenu.Item class="min-h-11" disabled={zoom <= 0.5} onSelect={() => setZoom(zoom - 0.25)}><Minus />Zoom out</DropdownMenu.Item><DropdownMenu.Item class="min-h-11" disabled={zoom >= 4} onSelect={() => setZoom(zoom + 0.25)}><Plus />Zoom in</DropdownMenu.Item><DropdownMenu.Item class="min-h-11" onSelect={() => setZoom(1)}>Fit width</DropdownMenu.Item></DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root>
{/snippet}
<section bind:this={toolbar} class="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-x-1 gap-y-1 rounded-xl border bg-card/95 p-2 text-xs shadow-sm backdrop-blur sm:gap-x-3" aria-label="PDF controls">
 <div class="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start">
  {#if navigation}{@render navigation()}{/if}
  <Button variant="ghost" size="icon" class="hidden size-8 sm:inline-flex" onclick={() => goTo(current - 1)} disabled={current <= 1} aria-label="Previous page"><ChevronLeft /></Button>
  <form class="flex items-center gap-1" onsubmit={(e) => { e.preventDefault(); goTo(Number(jump)); }}><label class="sr-only" for="pdf-page">Page</label><input id="pdf-page" class="h-11 w-10 rounded-md border border-input bg-background px-1 text-center tabular-nums sm:h-7 sm:w-9" inputmode="numeric" bind:value={jump} /><span class="whitespace-nowrap text-muted-foreground">of {total || '…'}</span></form>
  <Button variant="ghost" size="icon" class="hidden size-8 sm:inline-flex" onclick={() => goTo(current + 1)} disabled={current >= total} aria-label="Next page"><ChevronRight /></Button>
  <div class="flex items-center sm:hidden">{@render zoomMenu()}{#if actions}{@render actions()}{/if}</div>
 </div>
 <div class={searchState.count > 0 ? 'hidden items-center gap-1 sm:flex' : 'flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start'}>
  <div class="hidden items-center gap-1 sm:flex"><Button variant="ghost" size="icon" class="size-8" onclick={() => setZoom(zoom - 0.25)} disabled={zoom <= 0.5} aria-label="Zoom out"><Minus /></Button><span class="w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span><Button variant="ghost" size="icon" class="size-8" onclick={() => setZoom(zoom + 0.25)} disabled={zoom >= 4} aria-label="Zoom in"><Plus /></Button><Button variant="ghost" size="sm" onclick={() => setZoom(1)}>Fit width</Button></div>
  <Button variant="ghost" size="sm" class="min-h-11 sm:min-h-8" disabled={!doc} onclick={() => showTools('search')} aria-label="Find in PDF"><Search /><span>Find</span></Button>
  <Button variant="ghost" size="sm" class="min-h-11 sm:min-h-8" disabled={!doc} onclick={() => showTools('pages')} aria-label="Show page thumbnails"><Grid2X2 /><span>Pages</span></Button>
  <div class="hidden sm:block">{#if actions}{@render actions()}{/if}</div>
 </div>
 {#if searchState.count > 0}<div class="flex w-full items-center justify-between gap-1 border-t pt-1"><Button variant="ghost" class="h-auto min-h-11 min-w-0 whitespace-normal px-2 text-left text-xs sm:min-h-8" aria-label="Find in PDF: {searchState.count} matching pages" onclick={() => showTools('search')}>{searchState.active >= 0 ? `${searchState.active + 1} of ${searchState.count} matches` : `${searchState.count} matches`}</Button><div class="flex shrink-0"><Button variant="ghost" size="icon" class="size-11 sm:size-8" aria-label="Previous search result" disabled={searchState.active <= 0} onclick={() => pdfTools?.previousResult()}><ChevronLeft /></Button><Button variant="ghost" size="icon" class="size-11 sm:size-8" aria-label="Next search result" disabled={searchState.active >= searchState.count - 1} onclick={() => pdfTools?.nextResult()}><ChevronRight /></Button><Button variant="ghost" size="icon" class="size-11 sm:size-8" aria-label="Clear document search" onclick={() => pdfTools?.clearSearch()}><X /></Button></div></div>{/if}
</section>

{#if doc}<PdfTools bind:this={pdfTools} {doc} {watermark} mode={toolsMode} {current} bind:open={toolsOpen} onpage={goTo} onquery={(query) => (searchTerm = query)} onstate={(state) => (searchState = state)} onreturnfocus={() => toolsTrigger?.focus({ preventScroll: true })} />{/if}
{#if textError}<p role="status" class="mb-3 text-xs text-muted-foreground">{textError}</p>{/if}

<div bind:this={host} class="space-y-4 overflow-x-auto">
	{#if loading}
		<p class="py-20 text-center text-muted-foreground">Opening the document…</p>
	{:else if error}
		<p class="py-20 text-center text-destructive">{error}</p>
	{:else}
		{#each sizes as size, i (i)}
			<section
				data-page={i + 1}
				class="relative mx-auto scroll-mt-44 bg-white shadow-sm"
				style="width: {size.width * scale}px; height: {size.height * scale}px; --total-scale-factor: {scale}; --scale-factor: {scale}"
				aria-label="Page {i + 1}"
			>
				<canvas class="h-full w-full" aria-hidden="true"></canvas>
				<div class="pdf-text-layer"></div>
				{#if watermark}<Watermark text={watermark} />{/if}
			</section>
		{/each}
	{/if}
</div>

<style>
	.pdf-text-layer { position: absolute; inset: 0; overflow: clip; line-height: 1; text-align: initial; letter-spacing: normal; word-spacing: normal; text-size-adjust: none; transform-origin: 0 0; --min-font-size: 1; --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size)); --min-font-size-inv: calc(1 / var(--min-font-size)); }
	.pdf-text-layer :global(span), .pdf-text-layer :global(br) { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0 0; user-select: text; }
	.pdf-text-layer > :global(:not(.markedContent)), .pdf-text-layer :global(.markedContent span:not(.markedContent)) { --font-height: 0; font-size: calc(var(--text-scale-factor) * var(--font-height)); --scale-x: 1; --rotate: 0deg; transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv)); }
	.pdf-text-layer :global(.markedContent) { display: contents; }
	.pdf-text-layer :global(mark) { color: transparent; background: color-mix(in oklab, var(--primary) 25%, transparent); }
	.pdf-text-layer :global(::selection) { background: color-mix(in oklab, var(--primary) 35%, transparent); }
</style>
