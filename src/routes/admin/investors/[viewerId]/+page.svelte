<script lang="ts">
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { act, formatBytes, formatDate } from '#lib/admin/op.ts';
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const v = $derived(data.viewer);
	const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
	let exporting = $state(false);
	let reading = $state<(typeof data.viewer.reads)[number] | null>(null);
	const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
	async function exportData() {
		exporting = true;
		const r = await act<{ downloadUrl: string }>('export_viewer_data', { viewerId: v.id }, 'Export ready');
		exporting = false;
		if (r) window.location.href = r.downloadUrl;
	}
	const access = $derived(data.access);
	const canEdit = $derived(data.member?.role !== 'observer');
	const viaLabel = { email: 'named on the allow list', domain: 'their domain is allowed', open: 'open link', none: 'no longer on the allow list' } as const;
	const statusLabel = (l: (typeof data.access.links)[number]) => l.status === 'revoked' ? 'Link revoked' : l.status === 'expired' ? 'Link expired' : l.blockedOnLink ? 'Removed' : access.blocked ? 'Blocked' : l.canEnter ? 'Can enter' : 'Cannot enter';
	const roomName = (id: string) => v.sessions.find((s) => s.roomId === id)?.roomName ?? 'A deleted room';
</script>

<svelte:head><title>{v.email ?? 'Investor'} · OpenRoom</title></svelte:head>

<div class="mb-2 text-sm"><a class="inline-flex min-h-11 items-center text-muted-foreground hover:underline sm:min-h-8" href="/admin/investors">← Investors</a></div>
<PageHeading title={v.email ?? 'Erased investor'} description={[v.firm, `First seen ${formatDate(v.firstSeenAt, data.timeZone)}`, `${v.downloads} download${v.downloads === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}>
	{#snippet actions()}
		<Button variant="outline" size="sm" disabled={exporting} onclick={exportData}>Export their data</Button>
		{#if v.email && canEdit}
			<DangerAction operation="erase_viewer" input={{ viewerId: v.id }} label="Erase investor" title="Erase this investor’s data?" confirmLabel="Erase investor" success="Investor data erased" onDone={() => goto('/admin/investors')} />
		{/if}
	{/snippet}
</PageHeading>

{#if v.email}
	<section class="mb-6 overflow-hidden rounded-xl border bg-card" aria-labelledby="access-title">
		<div class="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
			<div class="min-w-0">
				<h2 id="access-title" class="text-sm font-semibold">Access</h2>
				<p class="mt-1 text-xs text-muted-foreground">{#if access.blocked}Blocked from every room by {access.blocks.map((b) => b.value).join(', ')}.{:else}Links whose allow list names {v.email} or their domain, and links they visited. Access is checked again on every request.{/if}</p>
			</div>
			{#if canEdit}
				{#if access.blocked}
					{#each access.blocks as b (b.id)}<Button variant="outline" size="sm" onclick={() => act('remove_block', { blockId: b.id }, `Unblocked ${b.value}`)}>Unblock {b.value}</Button>{/each}
				{:else}
					<DangerAction operation="add_blocks" input={{ entries: [v.email] }} label="Block from all rooms" confirmLabel="Block" title="Block {v.email} from every room?" description="They can no longer enter any room through any link, and their open sessions end now. You can unblock them later from this page or the Investors page." success="Investor blocked" />
				{/if}
			{/if}
		</div>
		{#if access.links.length === 0}
			<p class="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">No link names them; they entered only through open links, or not at all.</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="pl-4 sm:pl-5">Room and link</Table.Head>
						<Table.Head class="hidden md:table-cell">Group</Table.Head>
						<Table.Head class="hidden sm:table-cell">Status</Table.Head>
						<Table.Head class="hidden md:table-cell">Last visit</Table.Head>
						{#if canEdit}<Table.Head class="pr-4 sm:pr-5"><span class="sr-only">Actions</span></Table.Head>{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each access.links as l (l.linkId)}
						<Table.Row>
							<Table.Cell class="max-w-0 py-3 pl-4 whitespace-normal sm:max-w-none sm:pl-5"><a class="font-medium break-words hover:underline" href="/admin/rooms/{l.roomId}/links">{l.roomName}</a><p class="mt-0.5 text-xs break-words text-muted-foreground">{l.linkLabel} · {viaLabel[l.via]}</p><p class="mt-1 text-xs text-muted-foreground sm:hidden">{statusLabel(l)} · Last visit <When at={l.lastVisitAt} timeZone={data.timeZone} /></p></Table.Cell>
							<Table.Cell class="hidden text-sm md:table-cell">{l.groupName ?? 'Whole room'}</Table.Cell>
							<Table.Cell class="hidden sm:table-cell"><Badge variant={l.canEnter ? 'secondary' : 'outline'}>{statusLabel(l)}</Badge></Table.Cell>
							<Table.Cell class="hidden text-sm text-muted-foreground md:table-cell"><When at={l.lastVisitAt} timeZone={data.timeZone} /></Table.Cell>
							{#if canEdit}<Table.Cell class="pr-4 text-right sm:pr-5">{#if l.canEnter}<DangerAction operation="remove_viewer_from_link" input={{ viewerId: v.id, linkId: l.linkId }} label="Remove from link" confirmLabel="Remove from link" title="Remove {v.email} from “{l.linkLabel}”?" success="Removed from the link" />{/if}</Table.Cell>{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</section>
{/if}

<h2 class="mb-2 text-sm font-semibold">Visits</h2>
<div class="mb-6 overflow-hidden rounded-xl border bg-card">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Room</Table.Head>
				<Table.Head class="hidden sm:table-cell">Link</Table.Head>
				<Table.Head class="hidden lg:table-cell">Answers</Table.Head>
				<Table.Head class="hidden md:table-cell">Started</Table.Head>
				<Table.Head class="hidden sm:table-cell">Last seen</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each v.sessions as s (s.id)}
				<Table.Row>
					<Table.Cell class="max-w-0 whitespace-normal py-3 sm:max-w-none"><a class="font-medium break-words hover:underline" href="/admin/rooms/{s.roomId}/activity">{s.roomName}</a><div class="mt-1.5 space-y-1 text-xs break-words text-muted-foreground sm:hidden"><p>{s.linkLabel}{#if !s.verified} · Unverified{/if}</p>{#if s.fields}<p>{Object.entries(s.fields).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>{/if}<p>Last seen <When at={s.lastSeenAt} timeZone={data.timeZone} /></p></div></Table.Cell>
					<Table.Cell class="hidden max-w-64 text-sm whitespace-normal sm:table-cell">{s.linkLabel} {#if !s.verified}<Badge variant="outline">Unverified</Badge>{/if}</Table.Cell>
					<Table.Cell class="hidden max-w-64 text-xs whitespace-normal break-words text-muted-foreground lg:table-cell">{s.fields ? Object.entries(s.fields).map(([k, x]) => `${k}: ${x}`).join(' · ') : ''}</Table.Cell>
					<Table.Cell class="hidden text-sm text-muted-foreground md:table-cell"><When at={s.createdAt} timeZone={data.timeZone} /></Table.Cell>
					<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"><When at={s.lastSeenAt} timeZone={data.timeZone} /></Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>

<h2 class="mb-2 text-sm font-semibold">Documents read</h2>
<div class="mb-6 overflow-hidden rounded-xl border bg-card">
	{#if v.reads.length === 0}
		<p class="p-6 text-center text-sm text-muted-foreground">No pages read yet.</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Document</Table.Head>
					<Table.Head class="hidden sm:table-cell">Room</Table.Head>
					<Table.Head class="hidden text-right sm:table-cell">Pages</Table.Head>
					<Table.Head class="text-right">Time</Table.Head>
					<Table.Head class="hidden md:table-cell">Last read</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each v.reads as r (r.roomId + r.fileId)}
					<Table.Row>
						<Table.Cell class="max-w-0 whitespace-normal py-3 sm:max-w-none"><button type="button" class="text-left font-medium break-words underline-offset-4 hover:underline" onclick={() => reading = r} aria-label="Reading details for {r.title ?? 'a deleted document'}">{r.title ?? 'A deleted document'}</button><p class="mt-1 text-xs text-muted-foreground sm:hidden">{roomName(r.roomId)} · {r.pages} pages</p><button type="button" class="mt-1 block text-xs text-primary hover:underline" onclick={() => reading = r}>Reading details</button></Table.Cell>
						<Table.Cell class="hidden text-sm sm:table-cell">{roomName(r.roomId)}</Table.Cell>
						<Table.Cell class="hidden text-right sm:table-cell">{r.pages}</Table.Cell>
						<Table.Cell class="w-20 text-right tabular-nums">{minutes(r.timeMs)}</Table.Cell>
						<Table.Cell class="hidden text-sm text-muted-foreground md:table-cell"><When at={r.lastAt} timeZone={data.timeZone} /></Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>

<Dialog.Root open={reading !== null} onOpenChange={(open) => { if (!open) reading = null; }}>
	<Dialog.Content class="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title class="pr-6 break-words">{reading?.title ?? 'A deleted document'}</Dialog.Title>
			<Dialog.Description class="break-all">Reading history for {v.email ?? 'this investor'}, across visits.</Dialog.Description>
		</Dialog.Header>
		{#if reading}
			<div class="min-h-0 space-y-4 overflow-y-auto">
				{#each reading.versions as version (version.fileVersionId)}
					<section class="overflow-hidden rounded-lg border" aria-label={version.version ? `Version ${version.version}` : 'Deleted version'}>
						<div class="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-3 text-sm">
							<div class="flex items-center gap-2"><h3 class="font-medium">{version.version ? `Version ${version.version}` : 'Deleted version'}</h3>{#if version.current}<Badge variant="secondary">Current</Badge>{/if}</div>
							<span class="text-muted-foreground">{minutes(version.timeMs)}{#if version.perPage.length} · {version.perPage.length}{version.pageCount ? ` of ${version.pageCount}` : ''} pages{/if}</span>
						</div>
						{#if version.perPage.length}
							<Table.Root><Table.Header><Table.Row><Table.Head>Page</Table.Head><Table.Head class="text-right">Time</Table.Head><Table.Head class="hidden text-right sm:table-cell">Last read</Table.Head></Table.Row></Table.Header><Table.Body>{#each version.perPage as page (page.page)}<Table.Row><Table.Cell>{page.page}</Table.Cell><Table.Cell class="text-right tabular-nums">{minutes(page.timeMs)}</Table.Cell><Table.Cell class="hidden text-right text-muted-foreground sm:table-cell"><When at={page.lastAt} timeZone={data.timeZone} /></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
						{/if}
						{#if version.video}
							<div class="space-y-2 p-4 text-sm"><p class="font-medium">Video segments watched{version.video.durationMs ? ` · ${clock(version.video.durationMs)} total` : ''}</p><p class="text-muted-foreground">{version.video.ranges.map(([start, end]) => `${clock(start)}–${clock(end)}`).join(', ') || 'No segments recorded.'}</p></div>
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<h2 class="mb-2 text-sm font-semibold">Questions</h2>
<div class="mb-6 overflow-hidden rounded-xl border bg-card">
	{#if v.questions.length === 0}
		<p class="p-6 text-center text-sm text-muted-foreground">No questions yet.</p>
	{:else}
		<ul class="divide-y text-sm">
			{#each v.questions as q (q.id)}
				<li class="flex flex-col items-start justify-between gap-2 px-4 py-3 sm:flex-row sm:gap-3">
					<a class="min-w-0 hover:underline" href="/admin/rooms/{q.roomId}/questions/{q.id}">
						<span class="line-clamp-2 break-words">{q.firstMessage}</span>
						<span class="text-xs text-muted-foreground"
							>{roomName(q.roomId)}{q.fileTitle ? ` · ${q.fileTitle}` : ''}{q.page ? `, page ${q.page}` : ''} · {q.messages} message{q.messages === 1
								? ''
								: 's'}</span
						>
					</a>
					<span class="shrink-0 text-muted-foreground"><When at={q.lastMessageAt} timeZone={data.timeZone} /></span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<h2 class="mb-2 text-sm font-semibold">Uploads for requests</h2>
<div class="mb-6 overflow-hidden rounded-xl border bg-card">
	{#if v.uploads.length === 0}
		<p class="p-6 text-center text-sm text-muted-foreground">No uploads yet.</p>
	{:else}
		<ul class="divide-y text-sm">
			{#each v.uploads as u (u.id)}
				<li class="flex flex-col items-start justify-between gap-2 px-4 py-3 sm:flex-row sm:gap-3">
					<span class="min-w-0 break-words">
						<a class="underline" href="/admin/rooms/{u.roomId}/requests/uploads/{u.id}">{u.name}</a>
						{#if u.late}<Badge variant="outline">Late</Badge>{/if}
						<span class="block text-xs text-muted-foreground"
							><a class="hover:underline" href="/admin/rooms/{u.roomId}/requests">{u.requestTitle}</a> · {roomName(u.roomId)} · {formatBytes(u.size)}</span
						>
					</span>
					<span class="shrink-0 text-muted-foreground"><When at={u.uploadedAt} timeZone={data.timeZone} /></span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if v.ndaAcceptances.length}
	<h2 class="mb-2 text-sm font-semibold">NDA acceptances</h2>
	<ul class="mb-6 divide-y rounded-xl border bg-card text-sm">
		{#each v.ndaAcceptances as a (a.acceptedAt)}
			<li class="flex flex-col justify-between gap-2 px-4 py-3 sm:flex-row">
				<span>{a.name} · {roomName(a.roomId)} {#if !a.verified}<Badge variant="outline">Unverified</Badge>{/if}</span>
				<span class="text-muted-foreground"><When at={a.acceptedAt} timeZone={data.timeZone} /></span>
			</li>
		{/each}
	</ul>
{/if}
