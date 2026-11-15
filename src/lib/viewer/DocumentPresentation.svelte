<script lang="ts">
	import { ChevronLeft, ChevronRight, Maximize, Minimize } from '@lucide/svelte';
	import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
	import { onDestroy } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import Watermark from './Watermark.svelte';

	let { title, pdf, image, page = 1, watermark, obscured = false, open = $bindable(false), onpage, onexit }: {
		title: string;
		pdf?: PDFDocumentProxy | null;
		image?: string;
		page?: number;
		watermark?: string | null;
		obscured?: boolean;
		open?: boolean;
		onpage?: (page: number) => void;
		onexit?: () => void;
	} = $props();

	let dialog: HTMLDialogElement;
	let canvas = $state<HTMLCanvasElement>();
	let width = $state(0);
	let height = $state(0);
	let failed = $state(false);
	let native = false;

	function enter() {
		dialog.showModal();
		open = true;
		if (document.fullscreenEnabled && !document.fullscreenElement) {
			void document.documentElement.requestFullscreen().then(() => {
				native = true;
				if (!dialog?.isConnected || !dialog.open) leaveNative();
			}).catch(() => {});
		}
	}

	function leaveNative() {
		if (native && document.fullscreenElement === document.documentElement) {
			void document.exitFullscreen().catch(() => {});
		}
		native = false;
	}

	onDestroy(leaveNative);

	function fullscreenChanged() {
		if (native && !document.fullscreenElement && dialog.open) dialog.close();
	}

	function closed() {
		leaveNative();
		open = false;
		onexit?.();
	}

	function turn(delta: number) {
		if (pdf) onpage?.(Math.max(1, Math.min(pdf.numPages, page + delta)));
	}

	function keys(event: KeyboardEvent) {
		if (!dialog.open || !pdf || event.altKey || event.metaKey || event.ctrlKey) return;
		if (event.key === 'ArrowRight' || event.key === 'PageDown') turn(1);
		else if (event.key === 'ArrowLeft' || event.key === 'PageUp') turn(-1);
		else return;
		event.preventDefault();
		event.stopPropagation();
	}

	$effect(() => {
		const source = pdf;
		const element = canvas;
		const number = page;
		const availableWidth = width;
		const availableHeight = height;
		if (!open || !source || !element || !availableWidth || !availableHeight) return;
		let stale = false;
		let task: RenderTask | undefined;
		failed = false;
		void (async () => {
			try {
				const slide = await source.getPage(number);
				if (stale) return;
				const base = slide.getViewport({ scale: 1 });
				const scale = Math.min(availableWidth / base.width, availableHeight / base.height);
				const w = base.width * scale;
				const h = base.height * scale;
				const density = Math.min(window.devicePixelRatio || 1, Math.sqrt(16_000_000 / (w * h)));
				const viewport = slide.getViewport({ scale: scale * density });
				element.width = Math.ceil(viewport.width);
				element.height = Math.ceil(viewport.height);
				element.style.width = `${w}px`;
				element.style.height = `${h}px`;
				task = slide.render({ canvas: element, viewport });
				await task.promise;
			} catch { if (!stale) failed = true; }
		})();
		return () => { stale = true; task?.cancel(); };
	});
</script>

<svelte:document onfullscreenchange={fullscreenChanged} />
<Button variant="ghost" size="sm" class="min-h-11 px-2 sm:min-h-8" aria-label="Full screen" title="Full screen" disabled={!pdf && !image} onclick={enter}>
	<Maximize /><span class="hidden sm:inline">Full screen</span>
</Button>
<dialog bind:this={dialog} aria-label={title} onclose={closed} onkeydown={keys} class="presentation fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-zinc-950 p-0 text-white open:flex open:flex-col">
	{#if open}
		<div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden" bind:clientWidth={width} bind:clientHeight={height}>
			{#if failed}<p role="alert">This page could not be displayed.</p>{/if}
			<div class="relative max-h-full max-w-full" class:hidden={failed} class:invisible={obscured}>
				{#if image}
					<img src={image} alt={title} class="block max-w-full object-contain" style:max-height={`${height}px`} draggable="false" />
				{:else}
					{#key page}<canvas bind:this={canvas} class="block" aria-label={`Page ${page}`}></canvas>{/key}
				{/if}
				{#if watermark}<Watermark text={watermark} />{/if}
			</div>
		</div>
		<div class="flex shrink-0 items-center justify-center gap-2 border-t border-white/15 p-1.5 text-sm">
			{#if pdf}
				<button type="button" class="control" aria-label="Previous page" disabled={page <= 1} onclick={() => turn(-1)}><ChevronLeft /></button>
				<span class="tabular-nums" aria-live="polite">{page} of {pdf.numPages}</span>
				<button type="button" class="control" aria-label="Next page" disabled={page >= pdf.numPages} onclick={() => turn(1)}><ChevronRight /></button>
			{/if}
			<button type="button" class="control" onclick={() => dialog.close()}><Minimize />Exit full screen</button>
		</div>
	{/if}
</dialog>

<style>
	:global(html:has(dialog.presentation[open])) { overflow: hidden; }
	.control { display: inline-flex; min-height: 44px; min-width: 44px; align-items: center; justify-content: center; gap: .5rem; border-radius: .375rem; padding-inline: .5rem; }
	.control:hover { background: rgb(255 255 255 / .12); }
	.control:disabled { opacity: .4; }
	.control :global(svg) { width: 1rem; height: 1rem; }
</style>
