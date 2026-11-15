<script lang="ts">
	import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, FolderClosed, LibraryBig, ListOrdered, MessagesSquare, Search } from '@lucide/svelte';
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

	const documentGrid = 'divide-y overflow-hidden rounded-xl border bg-card sm:grid sm:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent';

	let { data, appearance = false }: { data: PageData; appearance?: boolean } = $props();
	const currentUrl = $derived(page.shallow?.url ?? page.url);
	const query = $derived((currentUrl.searchParams.get('q') ?? '').slice(0, 200));
	const term = $derived(query.trim().toLowerCase());
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
		if (navigation.type === 'popstate' || navigation.shallow || currentUrl.hash === '#all-documents') return;
		const y = Number(currentUrl.searchParams.get('y'));
		if (Number.isFinite(y) && y > 0) {
			disableScrollHandling();
			window.scrollTo(0, Math.min(y, 1_000_000));
		}
	});
	function browseUrl(folder: string, search = '') {
		const url = new URL(currentUrl.href);
		url.searchParams.delete('y');
		if (folder) url.searchParams.set('folder', folder); else url.searchParams.delete('folder');
		if (search) url.searchParams.set('q', search); else url.searchParams.delete('q');
		return url;
	}
	function browse(folder: string, search = '') {
		return goto(browseUrl(folder, search), { state: page.state, shallow: true, replace: true, reset: false });
	}
	const libraryTitle = $derived(term ? 'Search results' : changedOnly ? 'Changed documents' : selectedFolder?.type === 'folder' ? selectedFolder.name : 'All documents');
	const folderOrigin = $derived(page.state.folderOrigin?.destination === folderId ? page.state.folderOrigin : undefined);
	async function openFolder(folder: string, fromList = false) {
		const url = browseUrl(folder);
		url.hash = '';
		url.searchParams.delete('changed');
		await goto(url, {
			state: fromList ? { folderOrigin: { destination: folder, label: libraryTitle } } : {},
			persistState: true,
		});
		const library = document.getElementById('all-documents');
		library?.focus({ preventScroll: true });
		library?.scrollIntoView({ block: 'nearest' });
	}
	function backFromFolder() {
		if (folderOrigin) history.back();
		else void openFolder(selectedFolder?.parentId ?? '');
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
<h1 class="sr-only">{data.roomName} documents</h1>

{#snippet reviewDownload(file: { id: string; name: string; version: number | null })}
	{#key `${data.readingScope}:${file.id}:${file.version}`}
		<ReviewButton disabled={appearance} linkId={data.linkId} fileId={file.id} version={file.version ?? 1}
			reviewed={reviewed.has(file.id)} name={file.name} onupdated={focusProgress} />
	{/key}
{/snippet}

{#if atRoot && !single && data.pins.length}
	<a href="#all-documents" class="sr-only focus:not-sr-only focus:inline-block focus:p-2">Skip to all documents</a>
{/if}
{#snippet featured()}
	{#if lead}
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
	{/if}
{/snippet}

{#if atRoot && lead && (resume || single)}
	<section class="reading-panel" aria-label={resume ? 'Continue reading' : 'Shared document'}>
		{#if resume}<h2 class="panel-title"><BookOpen />Continue reading</h2>{/if}
		{@render featured()}
	</section>
{/if}
{#if atRoot && !single && data.pins.length && ((!resume && lead) || rows.length || completedPins.length)}
	<section class="room-panel" aria-labelledby="start-title">
		<div class="panel-heading">
			<div class="flex min-w-0 items-center gap-2">
				<h2 id="start-title" class="panel-title shrink-0"><ListOrdered /><span>Start here</span></h2>
				<p id="review-progress" tabindex="-1" class="text-xs text-muted-foreground" role="status">
					{completedPins.length ? `${completedPins.length} of ${data.pins.length} reviewed` : `${data.pins.length} recommended document${data.pins.length === 1 ? '' : 's'}`}
				</p>
			</div>
			{#if completedPins.length && remainingPins.length}
				<Progress class="w-20" value={completedPins.length / data.pins.length * 100} aria-label="Start here review progress" />
			{/if}
		</div>
		<div class="space-y-3">
			{#if !resume}{@render featured()}{/if}
			{#if rows.length}
				<ol class={documentGrid}>
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
		</div>
	</section>
{/if}

{#snippet changedFilter()}
	{#if showChanges && data.changesSince !== null}<Button variant={changedOnly ? 'secondary' : 'outline'} size="sm" class="min-h-11" aria-pressed={changedOnly} onclick={toggleChanges} title={`Changed since ${new Date(data.changesSince).toLocaleString()}`}>{changedCount} changed<ArrowRight data-icon="inline-end" /></Button>{/if}
{/snippet}
{#if single}
	{@render changedFilter()}
{:else}
	<section class="room-panel" aria-labelledby="library-title">
		<div id="all-documents" tabindex="-1" class="panel-heading justify-between scroll-mt-4">
			<div class="flex min-w-0 flex-wrap items-center gap-2">
				{#if selectedFolder && folderId && !term && !changedOnly}
					<Button variant="outline" size="sm" class="min-h-11" aria-label={`Back to ${folderOrigin?.label ?? breadcrumb.at(-2)?.name ?? 'All documents'}`} onclick={backFromFolder}><ArrowLeft data-icon="inline-start" />Back</Button>
				{/if}
				<h2 id="library-title" class="panel-title min-w-0 [overflow-wrap:anywhere]">{#if !folderId}<LibraryBig />{/if}<span class="min-w-0">{libraryTitle}</span></h2>
				<span class="text-xs text-muted-foreground" role="status">{term || changedOnly ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : folderId ? `${matches.length} item${matches.length === 1 ? '' : 's'}` : `${documents.length} documents`}</span>
			</div>
			<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
				{@render changedFilter()}
				{#if documents.length || term || folderId}
					<div class="relative w-full sm:w-72"><Search class="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
						<Input type="search" placeholder="Search by title, folder or index…" aria-label="Search by title, folder or index" maxlength={200} class="min-h-11 pl-9" value={query} oninput={(event) => browse(folderId, event.currentTarget.value)} />
					</div>
				{/if}
			</div>
		</div>
		<div>
			{#if breadcrumb.length > 1 && !term && !changedOnly}
				<nav class="mb-2 flex flex-wrap items-center gap-2 text-xs" aria-label="Document folders">
					<button type="button" class="flex min-h-11 items-center text-muted-foreground hover:text-foreground" onclick={() => openFolder('')}>All documents</button>
					{#each breadcrumb as folder (folder.id)}
						<ChevronRight class="size-3 text-muted-foreground/50" />
						{#if folder.id === folderId}<span aria-current="page" class="font-medium [overflow-wrap:anywhere]">{folder.name}</span>{:else}<button type="button" class="flex min-h-11 items-center font-medium [overflow-wrap:anywhere]" onclick={() => openFolder(folder.id)}>{folder.name}</button>{/if}
					{/each}
				</nav>
			{/if}
			{#if matches.length}
				<ul aria-label="Document library" class={documentGrid}>
					{#each matches as node (node.id)}
						<DocumentListItem name={node.name} kind={node.kind} size={node.size}
							folderPath={term || changedOnly ? folderPaths.get(node.parentId ?? '') : undefined}
							folder={node.type === 'folder'} childCount={childCounts.get(node.id) ?? 0}
							href={fileHref(node.id)} downloadHref={canDownload(node.kind) ? downloadHref(node.id) : undefined}
							previewDownload={appearance && canDownload(node.kind)} change={node.change} onfolder={() => openFolder(node.id, true)} />
					{/each}
				</ul>
			{:else}
				<Empty.Root class="rounded-xl border bg-card py-14">
					<Empty.Header>
						<Empty.Media variant="icon"><FolderClosed /></Empty.Media>
						<Empty.Title>{term ? 'No matching documents' : changedOnly ? 'No new or updated documents' : 'Nothing shared here yet'}</Empty.Title>
						<Empty.Description>{term ? 'Try another title, folder name or index number.' : changedOnly ? 'You’re up to date. New uploads and version changes will appear here.' : 'You’ll find the materials here when the team shares them.'}</Empty.Description>
					</Empty.Header>
					{#if term}<Empty.Content><Button variant="outline" size="sm" class="min-h-11 sm:min-h-8" onclick={() => browse(folderId)}>Clear search</Button></Empty.Content>{/if}
				</Empty.Root>
			{/if}
		</div>
	</section>
{/if}
{#if atRoot && data.faq.length}
	<section class="room-panel" aria-labelledby="faq-heading">
		<div class="panel-heading"><h2 id="faq-heading" class="panel-title"><MessagesSquare />Room FAQ</h2></div>
		<div class="divide-y">
			{#each data.faq as entry (entry.id)}
				<details class="group py-1.5">
					<summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">{entry.question}<ChevronDown class="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
					<div class="md mt-3 text-sm leading-relaxed text-muted-foreground">{@html entry.answerHtml}</div>
				</details>
			{/each}
		</div>
	</section>
{/if}
{#if data.downloads === 'zip'}<div class="mt-4">{#key data.readingScope}<DownloadRoom disabled={appearance} linkId={data.linkId} />{/key}</div>{/if}

<style>
	.room-panel { margin-bottom: clamp(1.5rem, 3vw, 2.25rem); }
	.reading-panel {
		margin-bottom: 1.5rem;
		overflow: clip;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
	}
	.panel-title {
		display: flex;
		align-items: center;
		gap: .6rem;
		font-size: 1.125rem;
		font-weight: 600;
		letter-spacing: -.015em;
	}
	.panel-heading, .reading-panel > .panel-title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: .75rem;
	}
	.panel-heading { margin-bottom: .75rem; }
	.reading-panel > .panel-title {
		padding: .875rem clamp(.875rem, 2vw, 1.5rem);
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--primary) 7%, var(--card));
	}
	.panel-title > span, .panel-heading [role="status"] {
		text-box: trim-both cap alphabetic;
	}
	.panel-title :global(svg) { width: 1.1rem; height: 1.1rem; flex-shrink: 0; color: var(--primary); }
	.reading-panel > :global(article) { border: 0; border-radius: 0; }
</style>
