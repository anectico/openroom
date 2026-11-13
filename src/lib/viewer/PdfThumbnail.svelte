<script lang="ts">
	import { Check } from '@lucide/svelte';
	import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
	import { onMount } from 'svelte';

	let { doc, number, selected, watermark = null, onselect, onready }: { doc: PDFDocumentProxy; number: number; selected: boolean; watermark?: string | null; onselect: () => void; onready?: () => void } = $props();
	let canvas: HTMLCanvasElement;
	let failed = $state(false);
	onMount(() => {
		let cancelled = false;
		let task: RenderTask | undefined;
		void (async () => {
			try {
				const page = await doc.getPage(number);
				if (cancelled) return;
				const base = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({ scale: Math.min(110 / base.width, 145 / base.height) });
				canvas.width = Math.ceil(viewport.width);
				canvas.height = Math.ceil(viewport.height);
				const context = canvas.getContext('2d');
				if (!context) return;
				task = page.render({ canvasContext: context, canvas, viewport });
				await task.promise;
                if (!cancelled) onready?.();
			} catch { if (!cancelled) failed = true; }
		})();
		return () => { cancelled = true; task?.cancel(); };
	});
</script>

<button type="button" class="flex min-h-44 flex-col items-center justify-end gap-2 rounded-lg border p-2 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring {selected ? 'border-primary bg-primary/5' : 'bg-card'}" aria-label="Go to page {number}" aria-current={selected ? 'page' : undefined} onclick={onselect}>
	<div class="relative max-w-full overflow-hidden"><canvas bind:this={canvas} class="max-w-full bg-white shadow-sm" aria-hidden="true"></canvas>{#if watermark}<span aria-hidden="true" class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"><span class="rotate-[-28deg] text-center text-[7px] leading-relaxed break-all text-black/30 [text-shadow:0_0_2px_white]">{watermark}</span></span>{/if}</div>
	<span class="flex min-h-8 flex-col items-center justify-center text-xs"><span class="inline-flex items-center gap-1">{#if selected}<Check class="size-3.5 text-primary" />{/if}Page {number}</span>{#if selected}<span class="text-primary">Current</span>{/if}{#if failed}<span>Preview unavailable</span>{/if}</span>
</button>
