<script lang="ts">
	import { Activity, Building2, Clock3, Download, Eye, Files, ListFilter, Users } from '@lucide/svelte';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';

	let { data } = $props();
	let link = $derived(data.query.link ?? '');
	let group = $derived(data.query.group ?? '');
	let days = $derived(data.query.days ?? '');
	const a = $derived(data.activity);
	const hasAnswers = $derived(a.investors.some((i) => i.fields && Object.keys(i.fields).length));
	const filtered = $derived(Boolean(data.query.link || data.query.group || data.query.days));
	const views = [
		{ key: 'investors', label: 'Investors', icon: Users },
		{ key: 'firms', label: 'Firms', icon: Building2 },
		{ key: 'files', label: 'Files', icon: Files },
		{ key: 'timeline', label: 'Timeline', icon: Activity },
	] as const;
	let view: string = $derived(views.find((item) => item.key === data.query.view)?.key ?? 'investors');
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
		zip_download: 'Downloaded the zip',
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

<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<h2 class="text-xl font-semibold tracking-tight">Room analytics</h2>
	<Button href={csvHref} variant="outline" download><Download />Export CSV</Button>
</header>

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

	<Tabs.Root bind:value={view} class="gap-0">
		<div class="px-3 py-3 sm:px-5">
			<Tabs.List class="w-full sm:w-fit" aria-label="Activity views">
				{#each views as item (item.key)}
					<Tabs.Trigger value={item.key}><item.icon aria-hidden="true" class="hidden sm:block" />{item.label}</Tabs.Trigger>
				{/each}
			</Tabs.List>
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
								<Table.Head class="hidden text-right sm:table-cell">Visits</Table.Head>
								<Table.Head class="hidden text-right md:table-cell">Files</Table.Head>
								<Table.Head class="text-right">Time</Table.Head>
								<Table.Head class="hidden text-right lg:table-cell">Downloads</Table.Head>
								<Table.Head class="hidden sm:table-cell">Last seen</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each a.investors as i (i.viewerId)}
								<Table.Row>
									<Table.Cell>
										<a class="block max-w-60 break-all whitespace-normal font-medium hover:underline" href="/admin/investors/{i.viewerId}">{i.email ?? 'Erased investor'}</a>
										{#if !i.verified}<Badge variant="outline" class="mt-1 text-[10px]">Unverified</Badge>{/if}
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
							{/each}
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
								<Table.Head class="text-right">Viewers</Table.Head>
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
				<ul class="divide-y">
					{#each a.files as f (f.fileId)}
						<li class="px-4 py-4 sm:px-5">
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<p class="min-w-0 break-words font-medium"><span class="mr-1 rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{f.number}</span> {f.title}</p>
								<p class="text-sm text-muted-foreground">
									{f.viewers} viewer{f.viewers === 1 ? '' : 's'} · average {minutes(f.avgMs)}
									{#if f.versionsRead.length > 1}· versions read: {f.versionsRead.join(', ')}{/if}
								</p>
							</div>
							{#if f.perPage.length && f.pages}
								{@const max = f.perPage.reduce((highest, p) => Math.max(highest, p.ms), 1)}
								{@const pages = new Map(f.perPage.map((p) => [p.page, p]))}
								<p class="mt-3 text-xs text-muted-foreground">Reading time by page</p>
								<div class="overflow-x-auto">
									<div class="mt-2 flex h-12 items-end gap-px" role="img" aria-label="Time spent per page">
									{#each Array.from({ length: f.pages }, (_, i) => i + 1) as page (page)}
										{@const p = pages.get(page)}
										<div
											class="min-w-[3px] flex-1 rounded-t bg-primary/70"
											style="height: {p ? Math.max(4, (p.ms / max) * 100) : 0}%"
											title="Page {page}: {p ? `${minutes(p.ms)}, ${p.viewers} viewer(s)` : 'not read'}"
										></div>
									{/each}
									</div>
								</div>
							{:else if f.videoWatchedByTenth}
								{@const max = Math.max(...f.videoWatchedByTenth, 1)}
								<p class="mt-3 text-xs text-muted-foreground">Viewers by video segment</p>
								<div class="mt-2 flex h-8 items-end gap-px" role="img" aria-label="Viewers per tenth of the video">
									{#each f.videoWatchedByTenth as n, i (i)}
										<div class="flex-1 rounded-t bg-primary/70" style="height: {Math.max(n ? 8 : 0, (n / max) * 100)}%" title="{i * 10}–{i * 10 + 10}%: {n} viewer(s)"></div>
									{/each}
								</div>
							{/if}
						</li>
					{:else}
						<li>{@render empty(Files, 'No files in this view', 'Add documents to the room to see file-level activity here.')}</li>
					{/each}
				</ul>
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
