<script lang="ts">
	import { ArrowLeft, ChevronLeft, ChevronRight, Download, MessageSquare, RotateCw } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { formatBytes } from '#lib/admin/op.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import DocumentPresentation from '#lib/viewer/DocumentPresentation.svelte';
	import { documentHref } from '#lib/viewer/navigation.ts';
	import PdfViewer from '#lib/viewer/PdfViewer.svelte';
	import ReviewButton from '#lib/viewer/ReviewButton.svelte';
	import ReviewVersion from '#lib/viewer/ReviewVersion.svelte';
	import { ReadTracker } from '#lib/viewer/tracker.ts';
	import VideoPlayer from '#lib/viewer/VideoPlayer.svelte';
	import Watermark from '#lib/viewer/Watermark.svelte';
	import { goto, invalidateAll } from '$app/navigation';
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
	let downloadState = $state<'stale' | 'session' | 'failed' | 'busy' | null>(null);
	const downloadText = { stale: 'A new version of this document is available.', session: 'Your session ended. Open your invitation link again.', failed: 'The download could not start. Check your connection and try again.', busy: 'Too many downloads. Wait a minute and try again.' };
	const prevHref = $derived(data.prev ? documentHref(data.linkId, data.prev.id, page.url.searchParams, data.guide) : null);
	const nextHref = $derived(data.next ? documentHref(data.linkId, data.next.id, page.url.searchParams, data.guide) : null);

	async function download(event?: Event) {
		event?.preventDefault();
		const href = `${src}&download=1`;
		downloadState = null;
		try {
			const r = await fetch(href, { method: 'HEAD', redirect: 'manual', cache: 'no-store' });
			if (r.status === 409) { downloadState = 'stale'; return; }
			if (r.type === 'opaqueredirect' || r.status === 401) { downloadState = 'session'; return; }
			if (r.status === 429) { downloadState = 'busy'; return; }
			if (!r.ok) { downloadState = 'failed'; return; }
		} catch { downloadState = 'failed'; return; }
		const link = document.createElement('a');
		link.href = href;
		link.download = '';
		link.click();
	}

	async function reload() {
		downloadState = null;
		await invalidateAll();
	}

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

	const src = $derived(`/v/${data.linkId}/files/${data.file.id}?version=${data.file.version}`);
	let tracker: ReadTracker | null = null;
	let imageElement = $state<HTMLImageElement>();

	const trackedLink = $derived(data.preview ? null : data.linkId);
	const trackedFile = $derived(data.file.id);
	const trackedVersion = $derived(data.file.version);

	$effect(() => {
		const linkId = trackedLink;
		const fileId = trackedFile;
		const version = trackedVersion;
		if (!linkId || !version) return;
		const t = new ReadTracker(linkId, fileId, version);
		tracker = t;
		const image = untrack(() => imageElement);
		if (image?.complete && image.naturalWidth) t.setPage(1);
		const video = document.querySelector<HTMLVideoElement>('main video');
		if (video) t.watch(video);
		return () => t.stop();
	});

	function protect(node: HTMLElement) {
		if (!data.protection) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const visibility = () => {
			clearTimeout(timer);
			hidden = document.visibilityState !== 'visible';
		};
		const blur = () => {
			clearTimeout(timer);
			timer = setTimeout(() => { if (!document.hasFocus()) hidden = true; }, 1500);
		};
		const focus = () => {
			clearTimeout(timer);
			hidden = document.visibilityState !== 'visible';
		};
		const block = (e: Event) => e.preventDefault();
		window.addEventListener('blur', blur);
		window.addEventListener('focus', focus);
		document.addEventListener('visibilitychange', visibility);
		node.addEventListener('contextmenu', block);
		node.addEventListener('dragstart', block);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('blur', blur);
			window.removeEventListener('focus', focus);
			document.removeEventListener('visibilitychange', visibility);
			node.removeEventListener('contextmenu', block);
			node.removeEventListener('dragstart', block);
		};
	}

	function watchImage(img: HTMLImageElement) {
		const loaded = () => {
			natural = img.naturalWidth;
			tracker?.setPage(1);
		};
		if (img.complete && img.naturalWidth) natural = img.naturalWidth;
		img.addEventListener('load', loaded);
		return () => img.removeEventListener('load', loaded);
	}
</script>

<svelte:head><title>{data.file.name} · {data.roomName}</title></svelte:head>

{#snippet downloadNotice()}
	{#if downloadState}
		<div class="flex flex-wrap items-center gap-2 text-sm" role="alert">
			<span>{downloadText[downloadState]}</span>
			{#if downloadState === 'stale'}<Button size="sm" onclick={reload}><RotateCw data-icon="inline-start" />Reload</Button>{/if}
		</div>
	{/if}
{/snippet}

<div class="reader {data.file.kind === 'pdf' ? 'reader-immersive reader-wide' : ''}">
<div class="mb-4 flex-wrap items-center justify-between gap-3 {data.file.kind === 'pdf' ? 'hidden sm:flex' : 'flex'}">
	<div class="min-w-0 max-w-full">
		{#if data.file.kind !== 'pdf'}<a class="mb-1 inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" href={data.backHref}><ArrowLeft class="size-3.5" />{data.backLabel}</a>{/if}
		<h1 class="break-words text-lg font-semibold tracking-tight sm:text-xl"><span class="mr-1 text-muted-foreground">{data.file.number}</span> {data.file.name}</h1>
		<ReviewVersion state={data.reviewState} />
		{#if data.guide}<p class="mt-1 text-xs text-muted-foreground">Start here · {data.guidePosition} of {data.guideTotal}</p>{/if}
	</div>
	<div class="flex flex-wrap items-center gap-2">
		{#if data.canDownload}
			<Button variant="outline" size="sm" href="{src}&download=1" onclick={download}><Download data-icon="inline-start" />Download</Button>
		{/if}
		{#if !data.preview && data.file.kind !== 'pdf'}
			<Button variant="outline" size="sm" onclick={toggleAsk}><MessageSquare data-icon="inline-start" />Ask about this document</Button>
		{/if}
		{#if data.prev && prevHref}<Button variant="ghost" size="sm" href={prevHref} title={data.prev.name}><ChevronLeft data-icon="inline-start" /><span class="min-w-0">Previous<span class="hidden sm:inline">: <span class="inline-block max-w-44 truncate align-bottom">{data.prev.name}</span></span></span></Button>{/if}
		{#if data.next && nextHref}<Button variant="ghost" size="sm" href={nextHref} title={data.next.name}><span class="min-w-0">Next<span class="hidden sm:inline">: <span class="inline-block max-w-44 truncate align-bottom">{data.next.name}</span></span></span><ChevronRight data-icon="inline-end" /></Button>{/if}
	</div>
	{#if downloadState}<div class="basis-full">{@render downloadNotice()}</div>{/if}
</div>
{#if data.file.kind === 'pdf' && downloadState}<div class="mb-2 px-2 sm:hidden">{@render downloadNotice()}</div>{/if}

<Dialog.Root bind:open={asking}><Dialog.Content class="max-h-[90dvh] overflow-y-auto overscroll-contain" showCloseButton={!sending} onInteractOutside={(event) => { if (sending) event.preventDefault(); }} onEscapeKeydown={(event) => { if (sending) event.preventDefault(); }}><Dialog.Header><Dialog.Title>{data.file.kind === 'pdf' ? `Ask about page ${askPage}` : 'Ask about this document'}</Dialog.Title><Dialog.Description class="break-words pr-4 [overflow-wrap:anywhere]">Your question about “{data.file.name}” is shared privately with the team running this room.</Dialog.Description></Dialog.Header><form class="flex flex-col gap-5" onsubmit={ask}>{#if !askState?.ok}<Field.Field><Field.Label for="question">Your question</Field.Label><Textarea id="question" class="field-sizing-fixed max-h-[35dvh]" disabled={sending} rows={5} maxlength={5000} required bind:value={question} placeholder="What would you like to know?" /></Field.Field>{/if}{#if askState}<p class="text-sm {askState.ok ? 'text-primary' : 'text-destructive'}" role="status">{askState.text}</p>{/if}<Dialog.Footer><Button type="button" variant="outline" disabled={sending} onclick={() => (asking = false)}>{askState?.ok ? 'Done' : 'Cancel'}</Button>{#if askState?.ok}<Button href="/v/{data.linkId}/questions">My questions<MessageSquare data-icon="inline-end" /></Button>{:else}<Button type="submit" disabled={sending || !question.trim()}>{sending ? 'Sending…' : 'Send question'}<MessageSquare data-icon="inline-end" /></Button>{/if}</Dialog.Footer></form></Dialog.Content></Dialog.Root>

<div
	class="relative {data.protection ? 'protected select-none' : ''}"
	{@attach protect}
>
	<div class={hidden ? 'blur-xl transition' : 'transition'}>
		{#key `${data.readingScope}:${data.file.id}:${data.file.version}`}
			{#if data.file.kind === 'pdf'}
				<PdfViewer
					url={src}
					title={data.file.name}
					obscured={hidden}
					initialPage={data.initialPage}
					resumePage={data.preview ? null : data.resumePage}
					readingScope={data.preview ? undefined : data.readingScope}
					fileId={data.file.id}
					version={data.file.version ?? 1}
					watermark={data.watermark}
					downloadHref={data.canDownload ? `${src}&download=1` : null}
					onreload={reload}
					onpage={(p) => {
						currentPage = p;
						tracker?.setPage(p);
					}}
				>
					{#snippet navigation()}<Button variant="ghost" size="sm" class="shrink-0 px-2" href={data.backHref} aria-label={data.backLabel} title={data.backLabel}><ArrowLeft data-icon="inline-start" /><span class="hidden sm:inline">Back</span></Button>{/snippet}
					{#snippet actions()}
						{#if !data.preview}
							<Button variant="outline" size="sm" class="ml-1 text-xs" onclick={toggleAsk}><MessageSquare data-icon="inline-start" />Ask about page {currentPage}</Button>
						{/if}
					{/snippet}
					{#snippet menu()}
						<DropdownMenu.Group>
							{#if !data.preview}<DropdownMenu.Item class="min-h-11" onSelect={toggleAsk}><MessageSquare />Ask about page {currentPage}</DropdownMenu.Item>{/if}
							{#if data.canDownload}<DropdownMenu.Item class="min-h-11" onSelect={() => download()}><Download />Download</DropdownMenu.Item>{/if}
							{#if data.prev && prevHref}<DropdownMenu.Item class="min-h-11" onSelect={() => goto(prevHref)}><ChevronLeft /><span class="min-w-0 truncate">Previous: {data.prev.name}</span></DropdownMenu.Item>{/if}
							{#if data.next && nextHref}<DropdownMenu.Item class="min-h-11" onSelect={() => goto(nextHref)}><ChevronRight /><span class="min-w-0 truncate">Next: {data.next.name}</span></DropdownMenu.Item>{/if}
						</DropdownMenu.Group>
					{/snippet}
				</PdfViewer>
			{:else if data.file.kind === 'image'}
				<div class="mb-2 flex items-center justify-end gap-1 text-sm">
					<DocumentPresentation title={data.file.name} image={src} watermark={data.watermark} obscured={hidden} />
					<Button variant="ghost" size="icon" onclick={() => (zoom = Math.max(0.25, zoom - 0.25))} aria-label="Zoom out">−</Button>
					<span class="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
					<Button variant="ghost" size="icon" onclick={() => (zoom = Math.min(4, zoom + 0.25))} aria-label="Zoom in">+</Button>
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
							bind:this={imageElement}
							{@attach watchImage}
						/>
						{#if data.watermark}<Watermark text={data.watermark} />{/if}
					</div>
				</div>
			{:else if data.file.kind === 'video'}
				<VideoPlayer {src} watermark={data.watermark} />
			{:else}
				<div class="mx-auto max-w-md rounded-lg border bg-background p-8 text-center">
					<p class="font-medium">{data.file.name}</p>
					<p class="mb-4 text-sm text-muted-foreground">{formatBytes(data.file.size)} · This document can only be downloaded.</p>
					<Button href="{src}&download=1" onclick={download}>Download</Button>
				</div>
			{/if}
		{/key}
	</div>
	{#if hidden}
		<div class="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-4">
			<div class="max-w-sm rounded-xl border bg-card px-5 py-4 text-center shadow-lg" role="status">
				<p class="font-medium">Document hidden while you are away</p>
				<p class="mt-1 text-sm text-muted-foreground">Return to this window to keep reading.</p>
			</div>
		</div>
	{/if}
</div>

	{#if data.file.kind === 'pdf' || (data.reviewable && !data.preview)}
		<section aria-label="Document completion" class="mt-5 {data.file.kind === 'pdf' ? 'px-4 sm:px-0' : ''} flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:gap-3">
				{#if data.reviewable && !data.preview}
					<div class="min-w-0">
						<ReviewVersion state={data.reviewState} />
						<ReviewButton outlined linkId={data.linkId} fileId={data.file.id} version={data.file.version ?? 1} reviewed={data.reviewed} name={data.file.name} />
					</div>
				{/if}
				<Button variant="ghost" size="sm" class="h-auto min-h-11 max-w-full px-2 whitespace-normal text-left [overflow-wrap:anywhere]" href={data.backHref}>
					<ArrowLeft data-icon="inline-start" /><span>{data.backLabel}</span>
				</Button>
			</div>
			{#if data.next}
				<a href={nextHref}
					class="flex w-full min-w-0 items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 hover:border-primary/40 hover:bg-primary/10 sm:w-auto sm:min-w-56 sm:max-w-md">
					<span class="min-w-0">
						<span class="block text-xs text-muted-foreground">{data.guide ? 'Next in Start here' : 'Next document'}</span>
						<span class="mt-0.5 block text-sm font-semibold [overflow-wrap:anywhere]">{data.next.name}</span>
					</span>
					<ChevronRight aria-hidden="true" class="size-4 shrink-0 text-primary" />
				</a>
			{/if}
		</section>
	{/if}
</div>

<style>
	@media (width < 40rem) {
		:global(.investor-brand:has(.reader-immersive) > header),
		:global(.investor-brand:has(.reader-immersive) > footer),
		:global(.investor-brand:has(.reader-immersive) > main > :not(.reader, dialog)) { display: none; }
		:global(.investor-brand:has(.reader-immersive) > main) { padding: 0 0 1rem; }
	}
	@media (width >= 80rem) {
		:global(.investor-brand:has(.reader-wide) > main),
		:global(.investor-brand:has(.reader-wide) > header > div),
		:global(.investor-brand:has(.reader-wide) > footer) { max-width: 88rem; }
	}
</style>
