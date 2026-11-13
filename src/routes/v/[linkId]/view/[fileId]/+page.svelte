<script lang="ts">
	import { ArrowLeft, ChevronLeft, ChevronRight, Download, MessageSquare } from '@lucide/svelte';
	import { formatBytes } from '#lib/admin/op.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { documentHref } from '#lib/viewer/navigation.ts';
	import PdfViewer from '#lib/viewer/PdfViewer.svelte';
	import ReviewButton from '#lib/viewer/ReviewButton.svelte';
	import ReviewVersion from '#lib/viewer/ReviewVersion.svelte';
	import { ReadTracker } from '#lib/viewer/tracker.ts';
	import VideoPlayer from '#lib/viewer/VideoPlayer.svelte';
	import Watermark from '#lib/viewer/Watermark.svelte';
	import { page } from '$app/state';

	let { data } = $props();
	let hidden = $state(false);
	let zoom = $state(1);
	let natural = $state(0);
	let currentPage = $state(1);
	let asking = $state(false);
	let askPage = $state(1);
	let question = $state('');
	let sending = $state(false);
	let askState = $state<{ ok: boolean; text: string } | null>(null);

	async function ask(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		sending = true;
		try {
		const r = await fetch(`/v/${data.linkId}/ask`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ fileId: data.file.id, page: data.file.kind === 'pdf' ? askPage : null, body: question }),
		});
		const body = await r.json().catch(() => null);
		if (r.ok && typeof body?.id === 'string') {
			question = '';
			askState = { ok: true, text: 'Sent. The answer will appear under My questions.' };
		} else askState = { ok: false, text: body?.error ?? (r.redirected ? 'Your question was not sent because access changed. Reopen your invitation before retrying.' : 'Your question could not be sent.') };
		} catch { askState = { ok: false, text: 'The connection failed. Try sending your question again.' }; } finally { sending = false; }
	}
	function toggleAsk() {
		asking = !asking;
		if (!question.trim()) askPage = currentPage;
		askState = null;
	}

	const src = $derived(`/v/${data.linkId}/files/${data.file.id}`);
	let tracker: ReadTracker | null = null;

	$effect(() => {
		const t = new ReadTracker(data.linkId, data.file.id);
		tracker = t;
		if (data.file.kind === 'image') t.setPage(1);
		const video = document.querySelector<HTMLVideoElement>('main video');
		if (video) t.watch(video);
		return () => t.stop();
	});

	function protect(node: HTMLElement) {
		if (!data.protection) return;
		const hide = () => (hidden = true);
		const show = () => (hidden = document.visibilityState !== 'visible');
		const block = (e: Event) => e.preventDefault();
		window.addEventListener('blur', hide);
		window.addEventListener('focus', show);
		document.addEventListener('visibilitychange', show);
		node.addEventListener('contextmenu', block);
		node.addEventListener('dragstart', block);
		return () => {
			window.removeEventListener('blur', hide);
			window.removeEventListener('focus', show);
			document.removeEventListener('visibilitychange', show);
			node.removeEventListener('contextmenu', block);
			node.removeEventListener('dragstart', block);
		};
	}
</script>

<svelte:head><title>{data.file.name} · {data.roomName}</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<div class="min-w-0 max-w-full">
		{#if data.file.kind !== 'pdf'}<a class="mb-1 inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" href={data.backHref}><ArrowLeft class="size-3.5" />{data.backLabel}</a>{/if}
		<h1 class="break-words text-lg font-semibold tracking-tight sm:text-xl"><span class="mr-1 text-muted-foreground">{data.file.number}</span> {data.file.name}</h1>
		<ReviewVersion state={data.reviewState} />
		{#if data.guide}<p class="mt-1 text-xs text-muted-foreground">Start here · {data.guidePosition} of {data.guideTotal}</p>{/if}
	</div>
	<div class="flex flex-wrap items-center gap-2">
		{#if data.reviewable && !data.preview}{#key `${data.readingScope}:${data.file.id}:${data.file.version}`}<ReviewButton linkId={data.linkId} fileId={data.file.id} version={data.file.version ?? 1} reviewed={data.reviewed} name={data.file.name} />{/key}{/if}
		{#if data.canDownload}
			<Button variant="outline" size="sm" class="min-h-11" href="{src}?download=1"><Download data-icon="inline-start" />Download</Button>
		{/if}
		{#if !data.preview && data.file.kind !== 'pdf'}
			<Button variant="outline" size="sm" class="min-h-11" onclick={toggleAsk}>Ask about this file</Button>
		{/if}
		{#if data.prev}<Button variant="ghost" size="sm" class="min-h-11" href={documentHref(data.linkId, data.prev.id, page.url.searchParams, data.guide)} title={data.prev.name} aria-label="Previous file"><ChevronLeft data-icon="inline-start" /><span>{data.guide ? 'Previous in Start here' : 'Previous file'}</span></Button>{/if}
		{#if data.next}<Button variant="ghost" size="sm" class="min-h-11" href={documentHref(data.linkId, data.next.id, page.url.searchParams, data.guide)} title={data.next.name} aria-label="Next file"><span>{data.guide ? 'Next in Start here' : 'Next file'}</span><ChevronRight data-icon="inline-end" /></Button>{/if}
	</div>
</div>

<Dialog.Root bind:open={asking}><Dialog.Content class="max-h-[90dvh] overflow-y-auto overscroll-contain" showCloseButton={!sending} onInteractOutside={(event) => { if (sending) event.preventDefault(); }} onEscapeKeydown={(event) => { if (sending) event.preventDefault(); }}><Dialog.Header><Dialog.Title>{data.file.kind === 'pdf' ? `Ask about page ${askPage}` : 'Ask about this file'}</Dialog.Title><Dialog.Description class="break-words pr-4 [overflow-wrap:anywhere]">Your question about “{data.file.name}” is shared privately with the team running this room.</Dialog.Description></Dialog.Header><form class="flex flex-col gap-5" onsubmit={ask}>{#if !askState?.ok}<Field.Field><Field.Label for="question">Your question</Field.Label><Textarea id="question" class="field-sizing-fixed max-h-[35dvh]" disabled={sending} rows={5} maxlength={5000} required bind:value={question} placeholder="What would you like to know?" /></Field.Field>{/if}{#if askState}<p class="text-sm {askState.ok ? 'text-primary' : 'text-destructive'}" role="status">{askState.text}</p>{/if}<Dialog.Footer><Button type="button" variant="outline" disabled={sending} onclick={() => (asking = false)}>{askState?.ok ? 'Done' : 'Cancel'}</Button>{#if askState?.ok}<Button href="/v/{data.linkId}/questions">My questions<MessageSquare data-icon="inline-end" /></Button>{:else}<Button type="submit" disabled={sending || !question.trim()}>{sending ? 'Sending…' : 'Send question'}<MessageSquare data-icon="inline-end" /></Button>{/if}</Dialog.Footer></form></Dialog.Content></Dialog.Root>

<div
	class="relative {data.protection ? 'protected select-none' : ''}"
	{@attach protect}
>
	<div class={hidden ? 'blur-xl transition' : 'transition'}>
		{#key `${data.readingScope}:${data.file.id}:${data.file.version}`}
			{#if data.file.kind === 'pdf'}
				<PdfViewer
					url={src}
					initialPage={data.initialPage}
					readingScope={data.preview ? undefined : data.readingScope}
					fileId={data.file.id}
					version={data.file.version ?? 1}
					watermark={data.watermark}
					onpage={(p) => {
						currentPage = p;
						tracker?.setPage(p);
					}}
				>
					{#snippet navigation()}<Button variant="ghost" size="sm" class="min-h-11 sm:min-h-8" href={data.backHref} aria-label={data.backLabel} title={data.backLabel}><ArrowLeft data-icon="inline-start" />Back</Button>{/snippet}
					{#snippet actions()}
						{#if !data.preview}
							<Button variant="outline" size="sm" class="ml-1 min-h-11 text-xs sm:min-h-8" onclick={toggleAsk} aria-label="Ask about page {currentPage}"><MessageSquare data-icon="inline-start" /><span class="hidden sm:inline">Ask about page {currentPage}</span><span class="sm:hidden">Ask</span></Button>
						{/if}
					{/snippet}
				</PdfViewer>
			{:else if data.file.kind === 'image'}
				<div class="mb-2 flex justify-end gap-1 text-sm">
					<button type="button" class="flex size-11 items-center justify-center rounded hover:bg-muted" onclick={() => (zoom = Math.max(0.25, zoom - 0.25))} aria-label="Zoom out">−</button>
					<span class="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
					<button type="button" class="flex size-11 items-center justify-center rounded hover:bg-muted" onclick={() => (zoom = Math.min(4, zoom + 0.25))} aria-label="Zoom in">+</button>
				</div>
				<div class="overflow-auto rounded-md border bg-background">
					<div
						class="relative mx-auto"
						style="width: {natural ? `${natural * zoom}px` : 'auto'}; max-width: {zoom <= 1 ? '100%' : 'none'}"
					>
						<img
							{src}
							alt={data.file.name}
							class="block w-full"
							draggable="false"
							onload={(e) => (natural = (e.currentTarget as HTMLImageElement).naturalWidth)}
							{@attach (img: HTMLImageElement) => {
								if (img.complete) natural = img.naturalWidth;
							}}
						/>
						{#if data.watermark}<Watermark text={data.watermark} />{/if}
					</div>
				</div>
			{:else if data.file.kind === 'video'}
				<VideoPlayer {src} watermark={data.watermark} />
			{:else}
				<div class="mx-auto max-w-md rounded-lg border bg-background p-8 text-center">
					<p class="font-medium">{data.file.name}</p>
					<p class="mb-4 text-sm text-muted-foreground">{formatBytes(data.file.size)} · This file can only be downloaded.</p>
					<Button href="{src}?download=1">Download</Button>
				</div>
			{/if}
		{/key}
	</div>
	{#if hidden}
		<p class="absolute inset-x-0 top-24 text-center font-medium">Come back to this window to keep reading.</p>
	{/if}
</div>

{#if data.file.kind === 'pdf'}<section class="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5" aria-label="Document completion"><h2 class="text-base font-semibold">Finished this document?</h2><p class="text-sm text-muted-foreground">{data.reviewable && !data.reviewed ? 'Mark it reviewed when you are ready.' : 'Continue at your own pace.'}</p><ReviewVersion state={data.reviewState} />{#if data.reviewable && !data.preview}<ReviewButton linkId={data.linkId} fileId={data.file.id} version={data.file.version ?? 1} reviewed={data.reviewed} name={data.file.name} />{/if}<div class="flex flex-col gap-2 border-t pt-3 sm:flex-row">{#if data.next}<Button class="min-h-11" href={documentHref(data.linkId, data.next.id, page.url.searchParams, data.guide)}>{data.guide ? 'Next in Start here' : 'Next document'}<ChevronRight data-icon="inline-end" /></Button>{/if}<Button variant="ghost" class="min-h-11" href={data.backHref}>{data.backLabel}</Button></div></section>{/if}
