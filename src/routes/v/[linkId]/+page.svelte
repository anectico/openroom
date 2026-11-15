<script lang="ts">
	import { ArrowRight, Check, ChevronDown, ChevronRight, FolderClosed, MessageSquare, Search } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import DocumentListItem from '#lib/viewer/DocumentListItem.svelte';
	import DownloadRoom from '#lib/viewer/DownloadRoom.svelte';
	import FeaturedDocument from '#lib/viewer/FeaturedDocument.svelte';
	import { documentHref } from '#lib/viewer/navigation.ts';
	import PinnedDocument from '#lib/viewer/PinnedDocument.svelte';
	import ReviewButton from '#lib/viewer/ReviewButton.svelte';
	import ReviewVersion from '#lib/viewer/ReviewVersion.svelte';
	import { type ReadingPlace, readingPlaces } from '#lib/viewer/reading.ts';
	import { afterNavigate, disableScrollHandling, goto } from '$app/navigation';
	import { page } from '$app/state';

	import type { PageData } from './$types';

	let { data, appearance = false }: { data: PageData; appearance?: boolean } = $props();
	const currentUrl = $derived(page.shallow?.url ?? page.url);
	const query = $derived((currentUrl.searchParams.get('q') ?? '').slice(0, 200));
	let scrollY = $state(0);
	const changedOnly = $derived(currentUrl.searchParams.get('changed') === '1');
	const changedCount = $derived(data.tree.filter((file) => file.change).length);
	let showReviewed = $state(false);
	type RoomNode = PageData['tree'][number];
	const nodes = $derived(new Map(data.tree.map((node) => [node.id, node])));
	const selectedFolder = $derived(nodes.get(currentUrl.searchParams.get('folder') ?? ''));
	const folderId = $derived(selectedFolder?.type === 'folder' ? selectedFolder.id : '');
	const reviewed = $derived(new Set(data.reviewedIds));
	const pinOrder = $derived(new Map(data.pins.map((pin, index) => [pin.id, index + 1])));
	const states = $derived(new Map(data.reviewStates.map((state) => [state.fileId, state])));
	const remainingPins = $derived(data.pins.filter((pin) => !reviewed.has(pin.id)));
	const completedPins = $derived(data.pins.filter((pin) => reviewed.has(pin.id)));
	function focusProgress() { document.getElementById('review-progress')?.focus({ preventScroll: true }); }
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
			const file = nodes.get(place.fileId);
			if (file?.kind === 'pdf' && file.version === place.version && !reviewed.has(file.id)) return { file, page: place.page };
		}
		return null;
	});
	$effect(() => { places = data.preview || appearance ? [] : readingPlaces(data.readingScope); });
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
		if (appearance) return undefined;
		const params = new URLSearchParams(currentUrl.search);
		params.set('y', String(Math.round(scrollY)));
		return documentHref(data.linkId, id, params, guide);
	}
	function downloadHref(id: string) {
		return appearance ? undefined : `/v/${data.linkId}/files/${id}?download=1`;
	}
	const folderPaths = $derived.by(() => {
		const paths = new Map<string, string>();
		for (const node of data.tree) {
			if (node.type !== 'folder') continue;
			const parent = node.parentId && paths.get(node.parentId);
			paths.set(node.id, parent ? `${parent} / ${node.name}` : node.name);
		}
		return paths;
	});
	const breadcrumb = $derived.by(() => {
		const path: RoomNode[] = [];
		for (let node = nodes.get(folderId); node; node = nodes.get(node.parentId ?? '')) path.unshift(node);
		return path;
	});
	const term = $derived(query.trim().toLowerCase());
	const matches = $derived.by(() => {
		if (!term && !changedOnly) return data.tree.filter((node) => node.parentId === (folderId || null));
		return data.tree.filter((node) => {
			if (changedOnly && !node.change) return false;
			const path = folderPaths.get(node.parentId ?? '') ?? '';
			return node.name.toLowerCase().includes(term) || path.toLowerCase().includes(term)
				|| node.number === term || node.number.startsWith(`${term}.`);
		});
	});
	const childCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const node of data.tree) if (node.parentId) counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
		return counts;
	});
	const documents = $derived(data.tree.filter((node) => node.type === 'file'));
	const atRoot = $derived(!term && !folderId && !changedOnly);
	const single = $derived(atRoot && documents.length === 1 ? documents[0] : undefined);
	const lead = $derived(resume?.file ?? single ?? nodes.get(remainingPins[0]?.id ?? ''));
	const visibleRowLimit = $derived(lead && pinOrder.has(lead.id) ? 2 : 3);
	const rows = $derived(remainingPins.filter((pin) => pin.id !== lead?.id));
	const showChanges = $derived(data.changesSince !== null && (changedCount > 0 || changedOnly) && (atRoot || changedOnly));
	const canDownload = (kind: string | null) => kind === 'download' || data.downloads === 'per_file';
	function openDocument(file: { id: string; kind: string | null }, guide: boolean) {
		return file.kind === 'download' ? downloadHref(file.id) : fileHref(file.id, guide);
	}
</script>

<svelte:window bind:scrollY />

<svelte:head><title>{data.roomName}</title></svelte:head>

{#snippet progress()}
	<p id="review-progress" tabindex="-1" class="text-xs text-muted-foreground" role="status">
		{completedPins.length ? `${completedPins.length} of ${data.pins.length} reviewed` : `${data.pins.length} recommended document${data.pins.length === 1 ? '' : 's'}`}
	</p>
	{#if completedPins.length && remainingPins.length}
		<Progress class="w-20" value={completedPins.length / data.pins.length * 100} aria-label="Start here review progress" />
	{/if}
{/snippet}

{#snippet reviewDownload(file: { id: string; name: string; version: number | null })}
	{#key `${data.readingScope}:${file.id}:${file.version}`}
		<ReviewButton disabled={appearance} linkId={data.linkId} fileId={file.id} version={file.version ?? 1}
			reviewed={reviewed.has(file.id)} name={file.name} onupdated={focusProgress} />
	{/key}
{/snippet}

{#if atRoot && !single && data.pins.length}
	<a href="#all-documents" class="sr-only focus:not-sr-only focus:inline-block focus:p-2">Skip to all documents</a>
{/if}
{#if atRoot && lead}
	<section class="mb-4" aria-label={resume ? 'Continue reading' : single ? 'Shared document' : 'Start here'}>
		{#if resume}
			<h2 class="mb-3 text-base font-semibold">Continue reading</h2>
		{:else if !single}
			<div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
				<h2 class="text-base font-semibold">Start here</h2>{@render progress()}
			</div>
		{/if}
		{#snippet leadControls()}
			{#if lead.kind === 'download'}{@render reviewDownload(lead)}
			{:else}<span class="inline-flex items-center gap-1.5 py-2 text-xs text-muted-foreground"><Check class="size-4" />Reviewed</span>{/if}
		{/snippet}
		{#snippet leadVersion()}<ReviewVersion state={states.get(lead.id)} />{/snippet}
		<FeaturedDocument name={lead.name} kind={lead.kind} size={lead.size} change={lead.change}
			folder={single ? undefined : folderPaths.get(lead.parentId ?? '')}
			href={openDocument(lead, pinOrder.has(lead.id))}
			downloadHref={lead.kind !== 'download' && canDownload(lead.kind) ? downloadHref(lead.id) : undefined}
			previewDownload={appearance && lead.kind !== 'download' && canDownload(lead.kind)}
			action={resume ? `Resume on page ${resume.page}` : single || lead.kind === 'download' ? undefined : completedPins.length ? 'Open next document' : 'Open first document'}
			controls={!data.preview && pinOrder.has(lead.id) && (lead.kind === 'download' || reviewed.has(lead.id)) ? leadControls : undefined}
			version={states.get(lead.id)?.previousVersion ? leadVersion : undefined} />
	</section>
{/if}
{#if atRoot && !single && (rows.length || completedPins.length)}
	<section class="mb-5" aria-label="Reading list">
		{#if resume || !lead}
			<div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1"><h2 class="text-base font-semibold">Start here</h2>{@render progress()}</div>
		{/if}
		{#if rows.length}
			<ol class="divide-y overflow-hidden rounded-xl border bg-card">
				{#each rows as file, index (file.id)}
					{#snippet controls()}{@render reviewDownload(file)}{/snippet}
					{#snippet version()}<ReviewVersion state={states.get(file.id)} />{/snippet}
					<PinnedDocument name={file.name} kind={file.kind} size={file.size} number={pinOrder.get(file.id) ?? 1}
						href={openDocument(file, true)} change={nodes.get(file.id)?.change}
						hidden={!expanded && index >= visibleRowLimit}
						controls={!data.preview && file.kind === 'download' ? controls : undefined}
						version={states.get(file.id)?.previousVersion ? version : undefined} />
				{/each}
			</ol>
			{#if rows.length > visibleRowLimit}<Button variant="ghost" class="mt-2 min-h-11 w-full sm:hidden" aria-expanded={expanded} onclick={expandPins}>{expanded ? 'Show fewer documents' : 'Show all recommended documents'}</Button>{/if}
		{/if}
		{#if completedPins.length}
			<details bind:open={showReviewed} class="mt-3 rounded-xl border bg-card">
				<summary class="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">Reviewed ({completedPins.length})</summary>
				<ol class="divide-y border-t">{#each completedPins as file (file.id)}
					<li class="flex flex-wrap items-center justify-between gap-x-3 px-4 py-1">
						<a class="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm [overflow-wrap:anywhere]" href={openDocument(file, true)}>
							<Check class="size-4 shrink-0 text-primary" />{file.name}
						</a>
						{#if file.kind === 'download'}{@render reviewDownload(file)}{/if}
					</li>
				{/each}</ol>
			</details>
		{/if}
	</section>
{/if}

{#if data.unreadReplies || actionCount || showChanges}
	<nav class="mb-4 flex flex-wrap gap-2" aria-label="Room updates">
		{#if showChanges && data.changesSince !== null}<Button variant={changedOnly ? 'secondary' : 'outline'} size="sm" class="min-h-11" aria-pressed={changedOnly} onclick={toggleChanges} title={`Changed since ${new Date(data.changesSince).toLocaleString()}`}>{changedCount} changed<ArrowRight data-icon="inline-end" /></Button>{/if}
		{#if data.unreadReplies}<Button href="/v/{data.linkId}/questions" variant="outline" size="sm" class="min-h-11"><MessageSquare data-icon="inline-start" />{data.unreadReplies} unread {data.unreadReplies === 1 ? 'reply' : 'replies'}</Button>{/if}
		{#if actionCount}<Button href="/v/{data.linkId}/requests" variant="outline" size="sm" class="min-h-11">{actionCount} {actionCount === 1 ? 'request needs' : 'requests need'} action<ArrowRight data-icon="inline-end" /></Button>{/if}
	</nav>
{/if}
{#if !single}
	<div id="all-documents" tabindex="-1" class="mt-5 mb-3 flex scroll-mt-4 flex-wrap items-center justify-between gap-2">
		<div class="flex flex-wrap items-baseline gap-2">
			<h2 class="text-base font-semibold">{term ? 'Search results' : changedOnly ? 'Changed documents' : folderId ? 'Documents in this folder' : 'All documents'}</h2>
			<span class="text-xs text-muted-foreground" role="status">{term || changedOnly ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : folderId ? `${matches.length} items` : `${documents.length} documents`}</span>
		</div>
		{#if documents.length || term || folderId}
			<div class="relative w-full sm:w-72"><Search class="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
				<Input type="search" placeholder="Search by title, folder or index…" aria-label="Search by title, folder or index" maxlength={200} class="min-h-11 pl-9" value={query} oninput={(event) => browse(folderId, event.currentTarget.value)} />
			</div>
		{/if}
	</div>
	{#if breadcrumb.length && !term && !changedOnly}
		<nav class="mb-2 flex flex-wrap items-center gap-2 text-xs" aria-label="Document folders">
			<button type="button" class="flex min-h-11 items-center text-muted-foreground hover:text-foreground" onclick={() => browse('')}>All documents</button>
			{#each breadcrumb as folder (folder.id)}
				<ChevronRight class="size-3 text-muted-foreground/50" />
				<button type="button" class="flex min-h-11 items-center font-medium" onclick={() => browse(folder.id)}>{folder.name}</button>
			{/each}
		</nav>
	{/if}
	<div class="overflow-hidden rounded-xl border bg-card">
		{#if matches.length}
			<ul class="divide-y">
				{#each matches as node (node.id)}
					<DocumentListItem name={node.name} kind={node.kind} size={node.size} number={node.number}
						folderPath={term || changedOnly ? folderPaths.get(node.parentId ?? '') : undefined}
						folder={node.type === 'folder'} childCount={childCounts.get(node.id) ?? 0}
						href={fileHref(node.id)} downloadHref={canDownload(node.kind) ? downloadHref(node.id) : undefined}
						previewDownload={appearance && canDownload(node.kind)} change={node.change} onfolder={() => browse(node.id)} />
				{/each}
			</ul>
		{:else}
			<Empty.Root class="py-14">
				<Empty.Header>
					<Empty.Media variant="icon"><FolderClosed /></Empty.Media>
					<Empty.Title>{term ? 'No matching documents' : changedOnly ? 'No new or updated documents' : 'Nothing shared here yet'}</Empty.Title>
					<Empty.Description>{term ? 'Try another title, folder name or index number.' : changedOnly ? 'You’re up to date. New uploads and version changes will appear here.' : 'You’ll find the materials here when the team shares them.'}</Empty.Description>
				</Empty.Header>
				{#if term}<Empty.Content><Button variant="outline" size="sm" class="min-h-11 sm:min-h-8" onclick={() => browse(folderId)}>Clear search</Button></Empty.Content>{/if}
			</Empty.Root>
		{/if}
	</div>
{/if}
{#if data.faq.length}
	<section class="mt-8" aria-labelledby="faq-heading">
		<h2 id="faq-heading" class="mb-4 text-sm font-semibold">Room FAQ</h2>
		<div class="divide-y rounded-xl border bg-card">
			{#each data.faq as entry (entry.id)}
				<details class="group px-4 py-1.5 sm:px-5">
					<summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">{entry.question}<ChevronDown class="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
					<div class="md mt-3 text-sm leading-relaxed text-muted-foreground">{@html entry.answerHtml}</div>
				</details>
			{/each}
		</div>
	</section>
{/if}
{#if data.downloads === 'zip'}<div class="mt-4">{#key data.readingScope}<DownloadRoom disabled={appearance} linkId={data.linkId} />{/key}</div>{/if}
