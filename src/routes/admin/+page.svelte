<script lang="ts">
	import { Activity, ArrowRight, Check, ChevronRight, CircleCheck, FolderClosed, Inbox, Link2, Mail, MessagesSquare, Plus, ShieldCheck, Upload } from '@lucide/svelte';
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import ViewingNow from '#lib/admin/ViewingNow.svelte';
	import When from '#lib/admin/When.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { cn } from '#lib/utils.js';

	let { data } = $props();
	const owner = $derived(data.member?.role === 'owner');
	const canEdit = $derived(data.member?.role !== 'observer');
	const attention = $derived(data.attention ?? { total: 0, questions: 0, requests: 0, unopenedLinks: 0, rooms: [], items: [] });
	const perRoom = $derived(new Map(attention.rooms.map((r) => [r.roomId, r])));
	const firstRoom = $derived(data.rooms[0]);
	const roomWithDocs = $derived(data.rooms.find((r) => r.fileCount > 0));
	const steps = $derived([
		{ title: 'Create a room', detail: 'One room per raise or deal.', done: data.rooms.length > 0, href: '/admin/rooms?new=1', icon: FolderClosed },
		{ title: 'Upload documents', detail: 'PDFs, images, videos and other files.', done: !!roomWithDocs, href: firstRoom ? `/admin/rooms/${firstRoom.id}` : null, icon: Upload },
		{ title: 'Send your first link', detail: 'A personal link for each investor, with its own access rules.', done: data.rooms.some((r) => r.activeLinkCount > 0), href: (roomWithDocs ?? firstRoom) ? `/admin/rooms/${(roomWithDocs ?? firstRoom).id}/links?new=1` : null, icon: Link2 },
	]);
	const setupDone = $derived(steps.every((s) => s.done));
	const nextStep = $derived(steps.findIndex((s) => !s.done));
	const stats = $derived([
		{ label: 'Rooms', value: data.rooms.length, icon: FolderClosed },
		{ label: 'Awaiting answer', value: attention.questions, icon: MessagesSquare },
		{ label: 'File requests to review', value: attention.requests, icon: Inbox },
		{ label: 'Active links', value: data.rooms.reduce((sum, r) => sum + r.activeLinkCount, 0), icon: Link2 },
	]);
	const kindIcon = { question: MessagesSquare, request_overdue: Inbox, request_uploads: Inbox, link_unopened: Link2 } as const;
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	let showAll = $state(false);
	const shown = $derived(showAll ? attention.items : attention.items.slice(0, 6));
</script>

<svelte:head><title>Overview · OpenRoom</title></svelte:head>

<PageHeading title="Overview" description="What needs you across your rooms, and who is reading." eyebrow="Workspace">
	{#snippet actions()}{#if canEdit && data.rooms.length}<Button href="/admin/rooms?new=1" size="sm"><Plus data-icon="inline-start" />New room</Button>{/if}{/snippet}
</PageHeading>

{#if !setupDone}
	<section class="mb-6 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="setup-title">
		<h2 id="setup-title" class="text-sm font-semibold">Get your first room ready</h2>
		<p class="mt-1 text-xs text-muted-foreground">{steps.filter((s) => s.done).length} of 3 done.</p>
		<ol class="mt-4 grid gap-3 md:grid-cols-3">
			{#each steps as step, index (step.title)}
				{@const next = index === nextStep}
				<li class={cn('flex gap-3 rounded-lg border p-4', next ? 'border-primary/50 bg-primary/5' : 'bg-card')}>
					<span class={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', step.done ? 'bg-primary text-primary-foreground' : next ? 'border border-primary text-primary' : 'border text-muted-foreground')} aria-hidden="true">{#if step.done}<Check class="size-4" />{:else}{index + 1}{/if}</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium">{step.title}<span class="sr-only">{step.done ? ', done' : next ? ', next step' : ''}</span></p>
						<p class="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
						{#if next && canEdit && step.href}<Button href={step.href} size="sm" class="mt-3">{step.title}<ArrowRight data-icon="inline-end" /></Button>{:else if step.done}<p class="mt-2 text-xs font-medium text-primary">Done</p>{/if}
					</div>
				</li>
			{/each}
		</ol>
	</section>
{/if}

{#if data.rooms.length}
	<Card.Root class="mb-6 gap-0 overflow-hidden py-0 shadow-none" aria-labelledby="attention-title">
		<Card.Header class="flex flex-row items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
			<div class="min-w-0"><Card.Title id="attention-title" class="text-sm">Needs attention</Card.Title><Card.Description class="mt-1 text-xs">{attention.total ? [attention.questions && `${plural(attention.questions, 'question')} waiting`, attention.requests && `${plural(attention.requests, 'file request')} to review`, attention.unopenedLinks && `${plural(attention.unopenedLinks, 'link')} never opened`].filter(Boolean).join(' · ') : 'Nothing is waiting for you.'}</Card.Description></div>
			{#if attention.total}<span class="flex min-w-7 items-center justify-center rounded-md bg-attention px-2 py-1 text-xs font-semibold text-attention-foreground">{attention.total}</span>{:else}<CircleCheck class="size-5 text-primary" aria-hidden="true" />{/if}
		</Card.Header>
		{#if attention.total}
			<Card.Content class="px-0">
				<ul class="divide-y">
					{#each shown as item (item.kind + item.id)}
						{@const Icon = kindIcon[item.kind]}
						<li><a href={item.href} class="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-attention text-attention-foreground"><Icon class="size-4" aria-hidden="true" /></span><span class="min-w-0 flex-1"><span class="block text-sm break-words">{item.text}</span><span class="mt-0.5 block text-xs text-muted-foreground">{item.roomName} · <When at={item.at} timeZone={data.timeZone} /></span></span><ChevronRight class="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" /></a></li>
					{/each}
				</ul>
			</Card.Content>
			{#if attention.items.length > 6}<Card.Footer class="border-t px-4 py-2 sm:px-5"><Button variant="ghost" size="sm" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${attention.items.length}`}</Button></Card.Footer>{/if}
		{/if}
	</Card.Root>

	{#if setupDone}
		<dl class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
			{#each stats as stat (stat.label)}
				<div class="rounded-xl border bg-card p-4 sm:p-5"><dt class="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">{stat.label}<stat.icon class="hidden size-4 text-muted-foreground/70 sm:block" strokeWidth={1.7} aria-hidden="true" /></dt><dd class="mt-2 text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-[28px]">{stat.value}</dd></div>
			{/each}
		</dl>
	{/if}
{/if}

<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
	<div class="flex min-w-0 flex-col gap-6">
		{#if data.rooms.length}
			<Card.Root class="gap-0 overflow-hidden py-0 shadow-none">
				<Card.Header class="flex flex-row items-center justify-between gap-4 border-b px-4 py-4 sm:px-5"><Card.Title class="text-sm">Your data rooms</Card.Title><a href="/admin/rooms" class="flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground hover:text-foreground sm:min-h-8">All rooms<ArrowRight class="size-3.5" /></a></Card.Header>
				<Card.Content class="px-0">
					<div class="divide-y">
						{#each data.rooms.slice(0, 5) as room (room.id)}
							{@const counts = perRoom.get(room.id)}
							<a href="/admin/rooms/{room.id}" class="group flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5">
								<span class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary"><FolderClosed class="size-[19px]" strokeWidth={1.5} /></span>
								<span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{room.name}</span><span class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{plural(room.fileCount, 'document')}</span><span>{plural(room.activeLinkCount, 'active link')}</span><span>{counts?.lastActivityAt ? 'Last visit' : 'No visits yet'}{#if counts?.lastActivityAt}&nbsp;<When at={counts.lastActivityAt} timeZone={data.timeZone} />{/if}</span></span></span>
								{#if counts?.total}<span class="shrink-0 rounded-md bg-attention px-2 py-0.5 text-xs font-medium text-attention-foreground">{plural(counts.total, 'open item')}</span>{/if}
								<ChevronRight class="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
							</a>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
		{#if data.rooms.length}
		<Card.Root class="gap-0 overflow-hidden py-0 shadow-none">
			<Card.Header class="flex flex-row items-center justify-between border-b px-5 py-4"><Card.Title class="text-sm">Recent activity</Card.Title><Activity class="size-4 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" /></Card.Header>
			<Card.Content class="px-5 py-2">
				{#if data.notices.length === 0}<p class="py-7 text-center text-xs text-muted-foreground">Investor visits, questions and downloads appear here.</p>{:else}
					<ul class="divide-y">{#each data.notices.slice(0, 5) as notice (notice.id)}<li class="flex gap-3 py-3.5"><span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Activity class="size-3.5" /></span><div class="min-w-0 flex-1"><a class="line-clamp-2 text-sm leading-relaxed hover:underline" href={notice.href}>{notice.text}</a><p class="mt-1 text-xs text-muted-foreground"><When at={notice.createdAt} timeZone={data.timeZone} /></p></div>{#if !notice.read}<span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"><span class="sr-only">Unread</span></span>{/if}</li>{/each}</ul>
				{/if}
			</Card.Content>
			<Card.Footer class="border-t px-5 py-2"><a href="/admin/notifications" class="flex min-h-11 items-center gap-1.5 text-xs font-medium sm:min-h-8">All notifications<ArrowRight class="size-3" /></a></Card.Footer>
		</Card.Root>
		{/if}
	</div>
	<div class="flex flex-col gap-5">
		{#if data.rooms.length}<ViewingNow initial={data.viewing} />{/if}
		<Card.Root class="gap-0 py-0 shadow-none">
			<Card.Header class="px-5 pt-5 pb-3"><Card.Title class="text-sm">Optional services</Card.Title><Card.Description class="mt-1 text-xs leading-relaxed">OpenRoom works without them. Each one unlocks more.</Card.Description></Card.Header>
			<Card.Content class="flex flex-col gap-0 px-5 pb-2">
				{#each [{ title: 'Email', detail: 'Send verification codes, invitations and reply notifications.', ready: data.emailReady, href: '/admin/settings#email', icon: Mail }, { title: 'S3 storage', detail: 'Keep documents and database backups off this server.', ready: data.system?.backupsReady, href: '/admin/settings/storage', icon: ShieldCheck }] as item (item.title)}
					<div class="flex items-center gap-3 border-t py-4"><item.icon class="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" /><div class="min-w-0 flex-1"><p class="text-xs font-medium">{item.title}</p><p class="mt-0.5 text-xs text-muted-foreground">{item.detail}</p></div>{#if item.ready}<span class="flex items-center gap-1 text-xs font-medium text-primary"><Check class="size-3.5" aria-hidden="true" />On</span>{:else if owner}<a href={item.href} class="flex min-h-11 items-center text-xs font-medium text-primary hover:underline sm:min-h-8">Set up</a>{:else}<span class="text-xs text-muted-foreground">Off</span>{/if}</div>
				{/each}
			</Card.Content>
		</Card.Root>
	</div>
</div>
