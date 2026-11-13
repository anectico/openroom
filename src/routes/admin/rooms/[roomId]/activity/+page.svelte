<script lang="ts">
	import { Clock3, Download, Eye, Users } from '@lucide/svelte';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';

	let { data } = $props();
	const a = $derived(data.activity);
	const hasAnswers = $derived(a.investors.some((i) => i.fields && Object.keys(i.fields).length));
	let view = $state('investors');
	const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
	const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
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
	const views = [
		{ key: 'investors', label: 'Investors' },
		{ key: 'firms', label: 'Firms' },
		{ key: 'files', label: 'Files' },
		{ key: 'timeline', label: 'Timeline' },
	] as const;
</script>

<svelte:head><title>{data.room.name} · Activity · OpenRoom</title></svelte:head>

{#if a.viewingNow.length}
	<div class="mb-4 rounded-lg border bg-background p-4">
		<p class="mb-1 text-sm font-medium">Viewing now</p>
		<ul class="text-sm">
			{#each a.viewingNow as v (v.sessionId)}
				<li>
					<a class="hover:underline" href="/admin/investors/{v.viewerId}">{v.email}</a>
					{#if v.fileTitle}<span class="text-muted-foreground"> · {v.fileTitle}</span>{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
	{#each [{ label: 'Investors', value: a.investors.length, icon: Users }, { label: 'Visits', value: a.investors.reduce((sum, i) => sum + i.visits, 0), icon: Eye }, { label: 'Reading time', value: minutes(a.investors.reduce((sum, i) => sum + i.timeMs, 0)), icon: Clock3 }, { label: 'Downloads', value: a.investors.reduce((sum, i) => sum + i.downloads, 0), icon: Download }] as stat (stat.label)}
		<Card.Root class="gap-0 py-0 shadow-none"><Card.Header class="flex flex-row items-center justify-between px-4 pt-3 pb-1 sm:px-5 sm:pt-5 sm:pb-3"><Card.Title class="text-xs font-medium text-muted-foreground">{stat.label}</Card.Title><stat.icon class="size-4 text-muted-foreground/70" strokeWidth={1.6} /></Card.Header><Card.Content class="px-4 pb-3 sm:px-5 sm:pb-5"><p class="text-2xl font-semibold tracking-tight tabular-nums">{stat.value}</p></Card.Content></Card.Root>
	{/each}
</div>

<form class="mb-4 flex flex-wrap items-end gap-2" method="GET">
	{#if data.links.length}
		<select name="link" aria-label="Link" class={selectClass} value={data.query.link ?? ''}>
			<option value="">All links</option>
			{#each data.links as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
		</select>
	{/if}
	{#if data.groups.length}
		<select name="group" aria-label="Group" class={selectClass} value={data.query.group ?? ''}>
			<option value="">All groups</option>
			{#each data.groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
		</select>
	{/if}
	<select name="days" aria-label="Time" class={selectClass} value={data.query.days ?? ''}>
		<option value="">Any time</option>
		<option value="1">Last 24 hours</option>
		<option value="7">Last 7 days</option>
		<option value="30">Last 30 days</option>
	</select>
	<Button type="submit" variant="outline" size="sm">Filter</Button>
	<Button href={csvHref} variant="ghost" size="sm" class="ml-auto" download>Export CSV</Button>
</form>

<Tabs.Root bind:value={view} class="gap-4"><Tabs.List class="w-full sm:w-fit" aria-label="Activity views">{#each views as item (item.key)}<Tabs.Trigger value={item.key}>{item.label}</Tabs.Trigger>{/each}</Tabs.List><Tabs.Content value={view}>

<div class="overflow-hidden rounded-xl border bg-card">
	{#if view === 'investors'}
		{#if a.investors.length === 0}
			<p class="p-8 text-center text-muted-foreground">Nobody has opened this room yet.</p>
		{:else}
			<Table.Root>
				<Table.Header>
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
								<a class="block max-w-[230px] truncate font-medium hover:underline sm:inline" href="/admin/investors/{i.viewerId}">{i.email}</a>
								{#if !i.verified}<Badge variant="outline" class="mt-1 text-[10px] sm:mt-0 sm:ml-1">Unverified</Badge>{/if}
								{#if i.firm}<p class="text-xs text-muted-foreground">{i.firm}</p>{/if}
								<p class="mt-1 text-xs text-muted-foreground sm:hidden">{i.visits} visit{i.visits === 1 ? '' : 's'} · <When at={i.lastSeenAt} timeZone={data.timeZone} /></p>
							</Table.Cell>
							{#if hasAnswers}<Table.Cell class="hidden text-xs text-muted-foreground md:table-cell">
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
			<p class="p-8 text-center text-muted-foreground">No firms yet. People using free mail are not grouped into a firm.</p>
		{:else}
			<Table.Root>
				<Table.Header>
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
							<Table.Cell class="font-medium">{f.firm}</Table.Cell>
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
				<li class="p-4">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<p class="font-medium"><span class="text-muted-foreground">{f.number}</span> {f.title}</p>
						<p class="text-sm text-muted-foreground">
							{f.viewers} viewer{f.viewers === 1 ? '' : 's'} · average {minutes(f.avgMs)}
							{#if f.versionsRead.length > 1}· versions read: {f.versionsRead.join(', ')}{/if}
						</p>
					</div>
					{#if f.perPage.length && f.pages}
						{@const max = Math.max(...f.perPage.map((p) => p.ms), 1)}
						<div class="mt-2 flex h-12 items-end gap-px" role="img" aria-label="Time spent per page">
							{#each Array.from({ length: f.pages }, (_, i) => i + 1) as page (page)}
								{@const p = f.perPage.find((x) => x.page === page)}
								<div
									class="min-w-[3px] flex-1 rounded-t bg-primary/70"
									style="height: {p ? Math.max(4, (p.ms / max) * 100) : 0}%"
									title="Page {page}: {p ? `${minutes(p.ms)}, ${p.viewers} viewer(s)` : 'not read'}"
								></div>
							{/each}
						</div>
					{:else if f.videoWatchedByTenth}
						{@const max = Math.max(...f.videoWatchedByTenth, 1)}
						<div class="mt-2 flex h-8 items-end gap-px" role="img" aria-label="Viewers per tenth of the video">
							{#each f.videoWatchedByTenth as n, i (i)}
								<div class="flex-1 rounded-t bg-primary/70" style="height: {Math.max(n ? 8 : 0, (n / max) * 100)}%" title="{i * 10}–{i * 10 + 10}%: {n} viewer(s)"></div>
							{/each}
						</div>
					{/if}
				</li>
			{:else}
				<li class="p-8 text-center text-muted-foreground">No files yet.</li>
			{/each}
		</ul>
	{:else}
		<ul class="divide-y">
			{#each a.timeline as e (e.id)}
				<li class="flex items-center justify-between gap-3 px-4 py-2 text-sm">
					<span>
						{#if e.viewerId}<a class="hover:underline" href="/admin/investors/{e.viewerId}">{e.email ?? 'Erased investor'}</a>{/if}
						<span class="text-muted-foreground">{label(e)}</span>
						{#if e.fileTitle}{e.fileTitle}{:else if e.requestTitle}“{e.requestTitle}”{/if}
					</span>
					<span class="text-xs text-muted-foreground"><When at={e.at} timeZone={data.timeZone} /></span>
				</li>
			{:else}
				<li class="p-8 text-center text-muted-foreground">Nothing has happened yet.</li>
			{/each}
		</ul>
	{/if}
</div>

</Tabs.Content></Tabs.Root>
