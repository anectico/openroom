<script lang="ts">
	import { ArrowUpRight, Download, File, FileImage, FileText, Film } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { formatBytes } from '#lib/admin/op.ts';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let { name, kind, size, folder, href, downloadHref, previewDownload = false, change, action, controls, version }: {
		name: string; kind: string | null; size: number | null; folder?: string; href?: string; downloadHref?: string; previewDownload?: boolean;
		change?: string | null; action?: string; controls?: Snippet; version?: Snippet;
	} = $props();
	const types = { pdf: { label: 'PDF', icon: FileText }, image: { label: 'Image', icon: FileImage }, video: { label: 'Video', icon: Film } };
	const type = $derived(types[kind as keyof typeof types] ?? { label: 'File', icon: File });
</script>

<article class="@container/feature overflow-hidden rounded-xl border bg-card">
	<div class="flex items-center gap-4 p-4 @md/feature:gap-6 @md/feature:p-0">
		<div class="art grid w-16 shrink-0 place-items-center self-stretch overflow-hidden rounded-lg @md/feature:order-last @md/feature:min-h-44 @md/feature:w-1/3 @md/feature:rounded-none @md/feature:border-l" aria-hidden="true">
			<div class="paper grid h-16 w-12 place-content-center justify-items-center gap-1 rounded-sm border bg-card text-primary shadow-sm @md/feature:h-24 @md/feature:w-[4.5rem]">
				<type.icon class="size-5 @md/feature:size-7" strokeWidth={1.4} /><span class="text-[8px] font-semibold tracking-wider uppercase">{type.label}</span>
			</div>
		</div>
		<div class="min-w-0 flex-1 @md/feature:py-6 @md/feature:pl-7">
			{#if folder}<p class="mb-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{folder}</p>{/if}
			<h3 class="text-xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] @md/feature:text-2xl">{name}</h3>
			<div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{type.label}{size !== null ? ` · ${formatBytes(size)}` : ''}{#if change}<Badge variant="secondary">{change === 'new' ? 'New' : 'Updated'}</Badge>{/if}</div>
			<div class="mt-3 flex flex-wrap gap-2">
				<Button {href} disabled={!href} class="min-h-11">{action ?? (kind === 'download' ? 'Download file' : 'Open document')}{#if kind === 'download' && !action}<Download />{:else}<ArrowUpRight />{/if}</Button>
				{#if previewDownload || (downloadHref && downloadHref !== href)}<Button href={downloadHref} disabled={previewDownload} variant="outline" class="min-h-11"><Download />Download</Button>{/if}
			</div>
		</div>
	</div>
	{#if controls || version}<div class="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/20 px-3">{#if version}{@render version()}{/if}{#if controls}{@render controls()}{/if}</div>{/if}
</article>

<style>
	.art { background: linear-gradient(140deg, color-mix(in srgb, var(--primary) 5%, var(--card)), color-mix(in srgb, var(--primary) 17%, var(--card))); }
	.paper { transform: rotate(-6deg); box-shadow: 4px 4px 0 color-mix(in srgb, var(--primary) 16%, var(--card)), 8px 8px 0 color-mix(in srgb, var(--primary) 9%, var(--card)); }
</style>
