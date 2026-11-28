<script lang="ts">
	import { Activity, ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronDown, Clock3, Download, Eye, Files, ListFilter, MailQuestion, Users } from '@lucide/svelte';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import SectionHeading from '#lib/admin/SectionHeading.svelte';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	let link = $derived(data.query.link ?? '');
	let group = $derived(data.query.group ?? '');
	let days = $derived(data.query.days ?? '');
	const a = $derived(data.activity);
	const hasAnswers = $derived(a.investors.some((i) => i.fields && Object.keys(i.fields).length));
	const filtered = $derived(Boolean(data.query.link || data.query.group || data.query.days));
	const views = $derived([
		{ key: 'investors', label: 'Investors', icon: Users },
		{ key: 'firms', label: 'Firms', icon: Building2 },
		{ key: 'files', label: 'Documents', icon: Files },
		{ key: 'timeline', label: 'Timeline', icon: Activity },
		...(data.member?.role === 'observer' ? [] : [{ key: 'pending', label: 'Not opened yet', icon: MailQuestion }]),
	]);
	let view: string = $derived(views.find((item) => item.key === data.query.view)?.key ?? 'investors');
	function chooseView(next: string) {
		view = next;
		const url = new URL(page.url.href);
		url.searchParams.set('view', next);
		if (next !== 'files') url.searchParams.delete('file');
		replaceState(url, page.state);
	}
	const fileFilter = $derived(page.url.searchParams.get('file') ?? '');
	const shownFiles = $derived(fileFilter ? a.files.filter((f) => f.fileId === fileFilter) : a.files);
	function clearFile() {
		const url = new URL(page.url.href);
		url.searchParams.delete('file');
		replaceState(url, page.state);
	}

	type Investor = (typeof a.investors)[number];
	type SortKey = 'timeMs' | 'visits' | 'files' | 'downloads' | 'lastSeenAt';
	let sortKey = $state<SortKey>('timeMs');
	let sortDesc = $state(true);
	function sortBy(key: SortKey) {
		if (sortKey === key) sortDesc = !sortDesc;
		else {
			sortKey = key;
			sortDesc = true;
		}
	}
	const ariaSort = (key: SortKey) => (sortKey === key ? (sortDesc ? 'descending' : 'ascending') : 'none');
	const sorted = $derived([...a.investors].sort((x, y) => (sortDesc ? y[sortKey] - x[sortKey] : x[sortKey] - y[sortKey]) || y.lastSeenAt - x.lastSeenAt));
	const idle = (i: Investor) => i.timeMs === 0 && !i.verified;
	const readers = $derived(sorted.filter((i) => !idle(i)));
	const idlers = $derived(sorted.filter(idle));
	let showIdle = $state(false);

	function pageSummary(f: (typeof a.files)[number]) {
		const top = [...f.perPage].sort((x, y) => y.ms - x.ms)[0];
		return `Reading time by page for ${f.title}: ${f.perPage.length} of ${f.pages} pages read${top ? `, most time on page ${top.page} (${minutes(top.ms)}, ${top.viewers} investor${top.viewers === 1 ? '' : 's'})` : ''}.`;
	}
	function videoSummary(f: (typeof a.files)[number]) {
		const tenths = f.videoWatchedByTenth ?? [];
		return `Investors by video segment for ${f.title}: ${tenths.map((n, i) => `${i * 10}–${i * 10 + 10}%: ${n}`).join(', ')}.`;
	}
	const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
	const stats = $derived([
		{ label: 'Investors', value: a.investors.length, icon: Users },
		{ label: 'Visits', value: a.investors.reduce((sum, i) => sum + i.visits, 0), icon: Eye },
		{ label: 'Reading time', value: minutes(a.investors.reduce((sum, i) => sum + i.timeMs, 0)), icon: Clock3 },
		{ label: 'Downloads', value: a.investors.reduce((sum, i) => sum + i.downloads, 0), icon: Download },
	]);
	const eventLabel: Record<string, string> = {
		visit: 'Opened the room',
		file_open: 'Opened',
		download: 'Downloaded',
		zip_download: 'Downloaded the ZIP',
		nda_accepted: 'Accepted the NDA',
		read_past: 'Read most of',
		question: 'Asked about',
		request_upload: 'Uploaded a file for',
	};
	const label = (e: { kind: string; fileTitle: string | null; requestTitle: string | null }) =>
		e.kind === 'question' && !e.fileTitle ? 'Asked a question' : (eventLabel[e.kind] ?? e.kind.replaceAll('_', ' '));
	const csvHref = $derived(`/admin/rooms/${data.room.id}/activity/csv?${new URLSearchParams({ ...data.query, view })}`);
</script>

<svelte:head><title>{data.room.name} · Analytics · OpenRoom</title></svelte:head>

{#snippet empty(Icon: typeof Users, title: string, description: string)}
	<div class="grid justify-items-center gap-2 px-5 py-12 text-center">
		<div class="mb-1 grid size-10 place-items-center rounded-xl bg-muted"><Icon aria-hidden="true" class="size-5 text-muted-foreground" /></div>
		<p class="text-base font-medium">{title}</p>
		<p class="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
	</div>
{/snippet}

<SectionHeading title="Analytics" description="Who opened the room, what they read and for how long.">
	{#snippet actions()}<Button href={csvHref} variant="outline" download><Download />Export CSV</Button>{/snippet}
</SectionHeading>

{#snippet sortHead(key: SortKey, text: string, cls: string)}
	<Table.Head class={cls} aria-sort={ariaSort(key)}>
		<button type="button" class="-mx-2 inline-flex min-h-9 items-center gap-1 rounded-md px-2 font-medium hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onclick={() => sortBy(key)}>
			{text}
			{#if sortKey === key}{#if sortDesc}<ArrowDown aria-hidden="true" class="size-3.5" />{:else}<ArrowUp aria-hidden="true" class="size-3.5" />{/if}{:else}<ArrowUpDown aria-hidden="true" class="size-3.5 opacity-40" />{/if}
			<span class="sr-only">{sortKey === key ? `, sorted ${sortDesc ? 'high to low' : 'low to high'}` : ', select to sort'}</span>
		</button>
	</Table.Head>
{/snippet}

{#snippet investorRow(i: Investor)}
	<Table.Row>
		<Table.Cell>
			<a class="block max-w-60 break-all whitespace-normal font-medium hover:underline" href="/admin/investors/{i.viewerId}">{i.email ?? 'Erased investor'}</a>
			{#if !i.verified}<Badge variant="outline" class="mt-1 text-xs">Unverified</Badge>{/if}
			{#if i.firm}<p class="text-xs text-muted-foreground">{i.firm}</p>{/if}
			<p class="mt-1 text-xs text-muted-foreground sm:hidden">{i.visits} visit{i.visits === 1 ? '' : 's'} · <When at={i.lastSeenAt} timeZone={data.timeZone} /></p>
		</Table.Cell>
		{#if hasAnswers}<Table.Cell class="hidden max-w-64 break-words whitespace-normal text-xs text-muted-foreground md:table-cell">
			{i.fields ? Object.entries(i.fields).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''}
		</Table.Cell>{/if}
		<Table.Cell class="hidden text-right sm:table-cell">{i.visits}</Table.Cell>
		<Table.Cell class="hidden text-right md:table-cell">{i.files}</Table.Cell>
		<Table.Cell class="text-right">{minutes(i.timeMs)}</Table.Cell>
		<Table.Cell class="hidden text-right lg:table-cell">{i.downloads}</Table.Cell>
		<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"><When at={i.lastSeenAt} timeZone={data.timeZone} /></Table.Cell>
	</Table.Row>
{/snippet}

<dl class="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-4">
	{#each stats as stat (stat.label)}
		<div class="px-4 py-3 even:border-l max-sm:nth-[n+3]:border-t sm:border-l sm:px-5 sm:py-4 sm:first:border-l-0">
			<dt class="flex items-center gap-2 text-xs font-medium text-muted-foreground"><stat.icon aria-hidden="true" class="size-4" />{stat.label}</dt>
			<dd class="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{stat.value}</dd>
		</div>
	{/each}
</dl>

{#if a.viewingNow.length}
	<section class="mb-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 rounded-xl border bg-card px-5 py-3">
		<h3 class="inline-flex items-center gap-2 text-sm font-medium"><span class="size-2 rounded-full bg-primary"></span>Viewing now</h3>
		<ul class="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm">
			{#each a.viewingNow as v (v.sessionId)}
				<li class="break-words"><a class="hover:underline" href="/admin/investors/{v.viewerId}">{v.email ?? 'Erased investor'}</a>
					{#if v.fileTitle}<span class="text-muted-foreground"> · {v.fileTitle}</span>{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="Activity details">
	<form class="grid grid-cols-2 items-end gap-3 border-b px-4 py-4 sm:flex sm:flex-wrap sm:px-5" method="GET">
		<input type="hidden" name="view" value={view} />
		{#if data.links.length}
			<div class="grid min-w-0 gap-1.5 sm:max-w-64"><label for="activity-link" class="text-xs font-medium text-muted-foreground">Sharing link</label>
				<ChoiceSelect id="activity-link" name="link" class="w-full" bind:value={link}
					options={[{ value: '', label: 'All links' }, ...data.links.map((l) => ({ value: l.id, label: l.label }))]} />
			</div>
		{/if}
		{#if data.groups.length}
			<div class="grid min-w-0 gap-1.5 sm:max-w-64"><label for="activity-group" class="text-xs font-medium text-muted-foreground">Investor group</label>
				<ChoiceSelect id="activity-group" name="group" class="w-full" bind:value={group}
					options={[{ value: '', label: 'All groups' }, ...data.groups.map((g) => ({ value: g.id, label: g.name }))]} />
			</div>
		{/if}
		<div class="grid min-w-0 gap-1.5"><label for="activity-time" class="text-xs font-medium text-muted-foreground">Time range</label>
			<ChoiceSelect id="activity-time" name="days" class="w-full" bind:value={days}
				options={[{ value: '', label: 'Any time' }, { value: '1', label: 'Last 24 hours' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }]} />
		</div>
		<Button type="submit" variant="outline" class={['h-11 sm:h-9', !filtered && Boolean(data.links.length) !== Boolean(data.groups.length) && 'max-sm:col-span-2']}><ListFilter />Filter</Button>
		{#if filtered}<Button href="?view={view}" variant="ghost" class="h-11 sm:h-9">Clear filters</Button>{/if}
	</form>

	<Tabs.Root bind:value={() => view, chooseView} class="gap-0">
		<div class="px-3 py-3 sm:px-5">
			<div class="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
				<Tabs.List class="w-max max-w-none min-w-full flex-nowrap sm:min-w-0" aria-label="Analytics views">
					{#each views as item (item.key)}
						<Tabs.Trigger value={item.key} class="min-h-11 sm:min-h-0"><item.icon aria-hidden="true" class="hidden sm:block" />{item.label}{#if item.key === 'pending' && a.notOpened.length}<span class="ml-1 rounded-full bg-muted px-1.5 text-xs tabular-nums">{a.notOpened.length}</span>{/if}</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</div>
		</div>
		<Tabs.Content value={view} class="min-w-0 border-t [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:pl-4 sm:[&_td:first-child]:pl-5 [&_th]:px-3 [&_th:first-child]:pl-4 sm:[&_th:first-child]:pl-5">
			{#if view === 'investors'}
				{#if a.investors.length === 0}
					{@render empty(Users, filtered ? 'No matching investors' : 'No investor visits yet', filtered ? 'Try another link, group or time range.' : 'Investor activity appears here when someone opens a sharing link.')}
				{:else}
					<Table.Root class="tabular-nums">
						<Table.Header class="bg-muted/40">
							<Table.Row>
								<Table.Head>Investor</Table.Head>
								{#if hasAnswers}<Table.Head class="hidden md:table-cell">Answers</Table.Head>{/if}
								{@render sortHead('visits', 'Visits', 'hidden text-right sm:table-cell')}
								{@render sortHead('files', 'Documents', 'hidden text-right md:table-cell')}
								{@render sortHead('timeMs', 'Time', 'text-right')}
								{@render sortHead('downloads', 'Downloads', 'hidden text-right lg:table-cell')}
								{@render sortHead('lastSeenAt', 'Last seen', 'hidden sm:table-cell')}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each readers as i (i.viewerId)}{@render investorRow(i)}{/each}
							{#if idlers.length}
								<Table.Row class="hover:bg-transparent">
									<Table.Cell colspan={7} class="bg-muted/20">
										<button type="button" class="flex min-h-11 w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground" aria-expanded={showIdle} onclick={() => (showIdle = !showIdle)}>
											<ChevronDown aria-hidden="true" class="size-4 transition-transform {showIdle ? 'rotate-180' : ''}" />
											{idlers.length} investor{idlers.length === 1 ? '' : 's'} opened but didn’t read <span class="text-xs">(unverified, no reading time)</span>
										</button>
									</Table.Cell>
								</Table.Row>
								{#if showIdle}{#each idlers as i (i.viewerId)}{@render investorRow(i)}{/each}{/if}
							{/if}
						</Table.Body>
					</Table.Root>
				{/if}
			{:else if view === 'firms'}
				{#if a.firms.length === 0}
					{@render empty(Building2, 'No firms in this view', 'Investors with a company email are grouped by domain. Personal email addresses appear under Investors.')}
				{:else}
					<Table.Root class="tabular-nums">
						<Table.Header class="bg-muted/40">
							<Table.Row>
								<Table.Head>Firm</Table.Head>
								<Table.Head class="text-right">Investors</Table.Head>
								<Table.Head class="hidden text-right md:table-cell">Visits</Table.Head>
								<Table.Head class="text-right">Time</Table.Head>
								<Table.Head class="hidden text-right lg:table-cell">Downloads</Table.Head>
								<Table.Head class="hidden sm:table-cell">Last seen</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each a.firms as f (f.firm)}
								<Table.Row>
									<Table.Cell class="max-w-60 break-all whitespace-normal font-medium">{f.firm}</Table.Cell>
									<Table.Cell class="text-right">{f.viewers}</Table.Cell>
									<Table.Cell class="hidden text-right md:table-cell">{f.visits}</Table.Cell>
									<Table.Cell class="text-right">{minutes(f.timeMs)}</Table.Cell>
									<Table.Cell class="hidden text-right lg:table-cell">{f.downloads}</Table.Cell>
									<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"><When at={f.lastSeenAt} timeZone={data.timeZone} /></Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			{:else if view === 'files'}
				{#if fileFilter}
					<div class="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2 text-sm sm:px-5"><span>Showing one document</span><Button variant="ghost" size="sm" onclick={clearFile}>Show all documents</Button></div>
				{/if}
				<ul class="divide-y">
					{#each shownFiles as f (f.fileId)}
						<li class="px-4 py-4 sm:px-5">
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<p class="min-w-0 break-words font-medium"><span class="mr-1 rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{f.number}</span> {f.title}</p>
								<p class="text-sm text-muted-foreground">
									{f.viewers} investor{f.viewers === 1 ? '' : 's'} · average {minutes(f.avgMs)}
									{#if f.versionsRead.length > 1}· versions read: {f.versionsRead.join(', ')}{/if}
								</p>
							</div>
							{#if f.perPage.length && f.pages}
								{@const max = f.perPage.reduce((highest, p) => Math.max(highest, p.ms), 1)}
								{@const pages = new Map(f.perPage.map((p) => [p.page, p]))}
								<p class="mt-3 text-xs text-muted-foreground">Reading time by page</p>
								<div class="overflow-x-auto">
									<div class="mt-2 flex h-12 items-end gap-px" role="img" aria-label={pageSummary(f)}>
									{#each Array.from({ length: f.pages }, (_, i) => i + 1) as page (page)}
										{@const p = pages.get(page)}
										<div
											class="min-w-[3px] flex-1 rounded-t bg-primary/70"
											style="height: {p ? Math.max(4, (p.ms / max) * 100) : 0}%"
											title="Page {page}: {p ? `${minutes(p.ms)}, ${p.viewers} investor(s)` : 'not read'}"
										></div>
									{/each}
									</div>
								</div>
								<div class="sr-only"><table>
									<caption>Reading time by page for {f.title}</caption>
									<thead><tr><th scope="col">Page</th><th scope="col">Time</th><th scope="col">Investors</th></tr></thead>
									<tbody>{#each f.perPage as p (p.page)}<tr><td>{p.page}</td><td>{minutes(p.ms)}</td><td>{p.viewers}</td></tr>{/each}</tbody>
								</table></div>
							{:else if f.videoWatchedByTenth}
								{@const max = Math.max(...f.videoWatchedByTenth, 1)}
								<p class="mt-3 text-xs text-muted-foreground">Investors by video segment</p>
								<div class="mt-2 flex h-8 items-end gap-px" role="img" aria-label={videoSummary(f)}>
									{#each f.videoWatchedByTenth as n, i (i)}
										<div class="flex-1 rounded-t bg-primary/70" style="height: {Math.max(n ? 8 : 0, (n / max) * 100)}%" title="{i * 10}–{i * 10 + 10}%: {n} investor(s)"></div>
									{/each}
								</div>
							{/if}
						</li>
					{:else}
						<li>{@render empty(Files, 'No documents in this view', 'Add documents to the room to see how each one is read.')}</li>
					{/each}
				</ul>
			{:else if view === 'pending'}
				{#if a.notOpened.length === 0}
					{@render empty(MailQuestion, 'Everyone invited has opened the room', 'Exact emails on the allow lists of active sharing links appear here until they visit. Domains are not listed.')}
				{:else}
					<p class="border-b px-4 py-3 text-sm text-muted-foreground sm:px-5">Exact emails on active sharing links that have not entered the room yet. Domains are not listed.</p>
					<ul class="divide-y">
						{#each a.notOpened as p (`${p.linkId}:${p.email}`)}
							<li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5">
								<span class="min-w-0 break-all font-medium">{p.email}</span>
								<span class="text-xs text-muted-foreground">{#if data.links.length}<a class="hover:underline" href="/admin/rooms/{data.room.id}/links?edit={p.linkId}">{p.linkLabel}</a>{:else}{p.linkLabel}{/if}{#if p.invitedAt} · invited <When at={p.invitedAt} timeZone={data.timeZone} />{/if}</span>
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<ul class="divide-y">
					{#each a.timeline as e (e.id)}
						<li class="flex items-start gap-3 px-4 py-3 text-sm sm:px-5">
							<div class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
								{#if e.kind.includes('download')}<Download class="size-4" />{:else if e.kind === 'visit'}<Eye class="size-4" />{:else}<Activity class="size-4" />{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="break-words font-medium">{label(e)} {e.fileTitle ?? e.requestTitle ?? ''}</p>
								{#if e.viewerId}<a class="break-all text-xs text-muted-foreground hover:underline" href="/admin/investors/{e.viewerId}">{e.email ?? 'Erased investor'}</a>{/if}
							</div>
							<span class="max-w-24 shrink-0 text-right text-xs text-muted-foreground sm:max-w-none"><When at={e.at} timeZone={data.timeZone} /></span>
						</li>
					{:else}
						<li>{@render empty(Activity, 'No events in this view', filtered ? 'Try another link, group or time range.' : 'Visits, document opens and downloads appear here as they happen.')}</li>
					{/each}
				</ul>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</section>
