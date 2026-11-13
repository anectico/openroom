<script lang="ts">
	import { ArrowRight, ChevronDown, ChevronRight, FolderClosed, MessageSquare, Search } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import DocumentListItem from '#lib/viewer/DocumentListItem.svelte';
	import DownloadRoom from '#lib/viewer/DownloadRoom.svelte';
	import { documentHref } from '#lib/viewer/navigation.ts';
	import PinnedDocument from '#lib/viewer/PinnedDocument.svelte';
	import ReviewButton from '#lib/viewer/ReviewButton.svelte';
	import ReviewVersion from '#lib/viewer/ReviewVersion.svelte';
	import RoomWelcome from '#lib/viewer/RoomWelcome.svelte';
	import { type ReadingPlace, readingPlaces } from '#lib/viewer/reading.ts';
	import { afterNavigate, disableScrollHandling, goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	const currentUrl = $derived(page.shallow?.url ?? page.url);
	const query = $derived((currentUrl.searchParams.get('q') ?? '').slice(0, 200));
	const folderId = $derived(data.tree.some((n) => n.type === 'folder' && n.id === currentUrl.searchParams.get('folder')) ? currentUrl.searchParams.get('folder') ?? '' : '');
	let scrollY = $state(0);
	const changedOnly = $derived(currentUrl.searchParams.get('changed') === '1');
	const changedCount = $derived(data.tree.filter((file) => file.change).length);
	let showReviewed = $state(false);
 const remainingPins = $derived(data.pins.filter((file) => !data.reviewedIds.includes(file.id)));
 const completedPins = $derived(data.pins.filter((file) => data.reviewedIds.includes(file.id)));
 function focusProgress() { document.getElementById('review-progress')?.focus({ preventScroll: true }); }
 const nextReview = $derived(data.pins.find((file) => !data.reviewedIds.includes(file.id)));
	const actionCount = $derived(data.requests.filter((request) => request.status === 'Action needed').length);
	function toggleChanges() {
		const url = new URL(currentUrl.href);
		url.searchParams.delete('y');
		if (changedOnly) url.searchParams.delete('changed'); else url.searchParams.set('changed', '1');
		void goto(url, { shallow: true, replace: true, reset: false });
	}
	const expanded = $derived(currentUrl.searchParams.get('expanded') === '1');
	let places = $state<ReadingPlace[]>([]);
	const resume = $derived.by(() => {
		for (const place of places) {
			const file = data.tree.find((n) => n.id === place.fileId && n.kind === 'pdf' && n.version === place.version);
			if (file) return { file, page: place.page };
		}
		return null;
	});
	$effect(() => { places = readingPlaces(data.readingScope); });
	afterNavigate((navigation) => {
		if (navigation.shallow || currentUrl.hash === '#all-documents') return;
		const y = Number(currentUrl.searchParams.get('y'));
		if (Number.isFinite(y) && y > 0) {
			disableScrollHandling();
			window.scrollTo(0, Math.min(y, 1_000_000));
		}
	});
	function browse(folder: string, search = '') {
		const url = new URL(currentUrl.href);
		url.searchParams.delete('y');
		if (folder) url.searchParams.set('folder', folder); else url.searchParams.delete('folder');
		if (search) url.searchParams.set('q', search); else url.searchParams.delete('q');
		void goto(url, { state: page.state, shallow: true, replace: true, reset: false });
	}
	function expandPins() {
		const url = new URL(currentUrl.href);
		if (expanded) url.searchParams.delete('expanded'); else url.searchParams.set('expanded', '1');
		void goto(url, { state: page.state, shallow: true, replace: true, reset: false });
	}
	function fileHref(id: string, guide = false) {
		const params = new URLSearchParams(currentUrl.search);
		params.set('y', String(Math.round(scrollY)));
		return documentHref(data.linkId, id, params, guide);
	}
	function folderPath(parentId: string | null) {
		const parts: string[] = [];
		for (let node = data.tree.find((n) => n.id === parentId); node; node = data.tree.find((n) => n.id === node?.parentId)) parts.unshift(node.name);
		return parts.join(' / ') || 'All documents';
	}
	const breadcrumb = $derived.by(() => { const out = []; for (let node = data.tree.find((n) => n.id === folderId); node; node = data.tree.find((n) => n.id === node?.parentId)) out.unshift(node); return out; });
	const matches = $derived(query.trim() || changedOnly ? data.tree.filter((node) => node.type === 'file' && (!changedOnly || node.change) && node.name.toLowerCase().includes(query.trim().toLowerCase())) : data.tree.filter((node) => node.parentId === (folderId || null)));
 const documentCount = $derived(data.tree.filter((node) => node.type === 'file').length);
	const canDownload = (kind: string | null) => kind === 'download' || data.downloads === 'per_file';
</script>

<svelte:window bind:scrollY />

<svelte:head><title>{data.roomName}</title></svelte:head>

{#key `${data.readingScope}:${data.welcomeRevision}`}
<RoomWelcome persistenceKey={`openroom:welcome:${data.readingScope}:${data.linkId}`} revision={data.welcomeRevision} name={data.roomName} html={data.welcomeHtml} personal={data.personalWelcome} compact={!!query.trim() || !!folderId || changedOnly}>
	{#snippet tools()}
<div class="mt-4 mb-3 flex flex-wrap items-center gap-2">
 <div class="relative min-w-0 basis-full sm:flex-1 sm:basis-auto"><Search class="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input type="search" placeholder="Find a document…" aria-label="Search file titles" maxlength={200} class="min-h-11 pl-9" value={query} oninput={(event) => browse(folderId, event.currentTarget.value)} /></div>
 <nav class="flex flex-wrap items-center gap-2" aria-label="Room tools">
  {#if ((!query.trim() && !folderId) || changedOnly) && data.changesSince !== null}<Button variant={changedOnly ? 'secondary' : 'outline'} size="sm" class="min-h-11" aria-pressed={changedOnly} onclick={toggleChanges} title={`Changed since ${new Date(data.changesSince).toLocaleString()}`}>{changedCount} changed<ArrowRight data-icon="inline-end" /></Button>{/if}
  <Button href="/v/{data.linkId}/questions" variant="outline" size="sm" class="min-h-11" title="Private conversations with the team"><MessageSquare data-icon="inline-start" />{data.unreadReplies ? `${data.unreadReplies} unread ${data.unreadReplies === 1 ? 'reply' : 'replies'}` : 'My questions'}</Button>
  {#if actionCount}<Button href="/v/{data.linkId}/requests" variant="outline" size="sm" class="min-h-11" aria-label={`${actionCount} ${actionCount === 1 ? 'request needs' : 'requests need'} action`}>{actionCount} {actionCount === 1 ? 'request' : 'requests'}<ArrowRight data-icon="inline-end" /></Button>{/if}
 </nav>
</div>
{#if resume && !query.trim() && !folderId && !changedOnly}<a href={fileHref(resume.file.id)} class="mb-3 flex min-h-16 items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"><span class="min-w-0"><span class="block text-xs text-muted-foreground">Continue reading · page {resume.page}</span><span class="mt-1 block break-words text-sm font-medium [overflow-wrap:anywhere]">{resume.file.name}</span></span><ArrowRight class="size-4 shrink-0" /></a>{/if}
	{/snippet}
</RoomWelcome>
{/key}
{#if data.pins.length && !query.trim() && !folderId && !changedOnly}
	<section class="mb-6" aria-labelledby="start-here-heading">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
   <div class="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 id="start-here-heading" class="text-base font-semibold">Start here</h2>
    {#if !data.preview}<p id="review-progress" tabindex="-1" class="text-xs text-muted-foreground" role="status">{completedPins.length ? `${completedPins.length} of ${data.pins.length} reviewed` : `${data.pins.length} ${data.pins.length === 1 ? 'document' : 'documents'} to get started`}</p>{#if completedPins.length && nextReview}<Progress class="w-20" value={completedPins.length / data.pins.length * 100} aria-label="Start here review progress" />{/if}{/if}
   </div>
   <div class="flex flex-wrap items-center gap-2"><Button href="#all-documents" variant="ghost" size="sm" class="min-h-11">All documents</Button>{#if !data.preview}{#if nextReview}<Button size="sm" class="min-h-11" href={fileHref(nextReview.id, true)}>{completedPins.length ? 'Continue review' : 'Start review'}<ArrowRight data-icon="inline-end" /></Button>{:else}<span class="text-sm font-medium text-primary">All reviewed</span>{/if}{/if}</div>
  </div>
		<ol class="grid gap-2 xl:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
			{#each remainingPins as document, index (document.id)}
				<PinnedDocument name={document.name} kind={document.kind} size={document.size} number={data.pins.findIndex((pin) => pin.id === document.id) + 1} href={document.kind === 'download' ? `/v/${data.linkId}/files/${document.id}?download=1` : fileHref(document.id, true)} change={data.tree.find((file) => file.id === document.id)?.change} hidden={!expanded && index >= 3} controls={data.preview ? undefined : reviewControl} version={data.reviewStates.find((state) => state.fileId === document.id)?.previousVersion ? reviewVersion : undefined} />
    {#snippet reviewControl()}{#key `${data.readingScope}:${document.id}:${document.version}`}<ReviewButton linkId={data.linkId} fileId={document.id} version={document.version ?? 1} reviewed={data.reviewedIds.includes(document.id)} name={document.name} onupdated={focusProgress} />{/key}{/snippet}
    {#snippet reviewVersion()}<ReviewVersion state={data.reviewStates.find((state) => state.fileId === document.id)} />{/snippet}
			{/each}
		</ol>
		{#if remainingPins.length > 3}<Button variant="ghost" class="mt-2 min-h-11 w-full sm:hidden" aria-expanded={expanded} onclick={expandPins}>{expanded ? 'Show fewer documents' : `Show all ${remainingPins.length} remaining documents`}</Button>{/if}
 {#if completedPins.length}<details bind:open={showReviewed} class="mt-3 rounded-xl border bg-card"><summary class="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">Show reviewed ({completedPins.length})</summary><ol class="divide-y border-t">{#each completedPins as document (document.id)}<li class="flex flex-wrap items-center justify-between gap-x-3 px-3 py-1"><a class="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm [overflow-wrap:anywhere]" href={fileHref(document.id, true)}><span class="shrink-0 whitespace-nowrap text-muted-foreground">{data.pins.findIndex((pin) => pin.id === document.id) + 1}.</span>{document.name}</a><ReviewButton linkId={data.linkId} fileId={document.id} version={document.version ?? 1} reviewed={true} name={document.name} onupdated={focusProgress} /></li>{/each}</ol></details>{/if}
	</section>
{/if}
<div>
	<div class="min-w-0">

        <div id="all-documents" tabindex="-1" class="mb-3 flex scroll-mt-4 flex-wrap items-center justify-between gap-2"><h2 class="text-base font-semibold">{query.trim() ? 'Search results' : changedOnly ? 'Changed documents' : folderId ? 'Documents in this folder' : 'All documents'}</h2><span class="text-xs text-muted-foreground" role="status">{query.trim() || changedOnly ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : folderId ? `${matches.length} items` : `${documentCount} document${documentCount === 1 ? '' : 's'}`}</span></div>
        {#if breadcrumb.length && !query.trim() && !changedOnly}<nav class="mb-2 flex flex-wrap items-center gap-2 text-xs" aria-label="Document folders"><button type="button" class="flex min-h-11 items-center text-muted-foreground hover:text-foreground" onclick={() => browse('')}>All documents</button>{#each breadcrumb as folder (folder.id)}<ChevronRight class="size-3 text-muted-foreground/50" /><button type="button" class="flex min-h-11 items-center font-medium" onclick={() => browse(folder.id)}>{folder.name}</button>{/each}</nav>{/if}
		<div class="overflow-hidden rounded-xl border bg-card">
			{#if matches.length}
				<ul class="divide-y">{#each matches as node (node.id)}<DocumentListItem name={node.name} kind={node.kind} size={node.size} number={node.number} folderPath={query.trim() || changedOnly ? folderPath(node.parentId) : undefined} folder={node.type === 'folder'} childCount={data.tree.filter((child) => child.parentId === node.id).length} href={fileHref(node.id)} downloadHref={canDownload(node.kind) ? `/v/${data.linkId}/files/${node.id}?download=1` : undefined} change={node.change} onfolder={() => browse(node.id)} />{/each}</ul>
			{:else}<Empty.Root class="py-14"><Empty.Header><Empty.Media variant="icon"><FolderClosed /></Empty.Media><Empty.Title>{changedOnly ? 'No new or updated documents' : query ? 'No matching documents' : 'Nothing shared here yet'}</Empty.Title><Empty.Description>{query ? 'Try a different title or clear your search.' : changedOnly ? 'You’re up to date. New uploads and version changes will appear here.' : 'You’ll find the materials here when the team shares them.'}</Empty.Description></Empty.Header>{#if query}<Empty.Content><Button variant="outline" size="sm" class="min-h-11 sm:min-h-8" onclick={() => browse(folderId)}>Clear search</Button></Empty.Content>{/if}</Empty.Root>{/if}
		</div>
		{#if data.faq.length}<section class="mt-8" aria-labelledby="faq-heading"><h2 id="faq-heading" class="mb-4 text-sm font-semibold">A little more context</h2><div class="divide-y rounded-xl border bg-card">{#each data.faq as entry (entry.id)}<details class="group px-5 py-4"><summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium">{entry.question}<ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary><div class="md mt-3 text-sm leading-relaxed text-muted-foreground">{@html entry.answerHtml}</div></details>{/each}</div></section>{/if}
	</div>
    {#if data.downloads === 'zip'}<div class="mt-4">{#key data.readingScope}<DownloadRoom linkId={data.linkId} />{/key}</div>{/if}
</div>
