<script lang="ts">
	import { Activity, ArrowRight, Check, ChevronRight, Circle, FileText, FolderClosed, Link2, Mail, Plus, Radio, ShieldCheck } from '@lucide/svelte';
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import ViewingNow from '#lib/admin/ViewingNow.svelte';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';

	let { data } = $props();
	let currentViewerCount = $state<number | null>(null);
	let currentViewersPaused = $state(false);
	const owner = $derived(data.member?.role === 'owner');
	const stats = $derived([
		{ label: 'Rooms', value: data.rooms.length, icon: FolderClosed, description: 'Your shared workspaces' },
		{ label: 'Documents', value: data.rooms.reduce((sum, r) => sum + r.fileCount, 0), icon: FileText, description: 'Across all rooms' },
		{ label: 'Active links', value: data.rooms.reduce((sum, r) => sum + r.activeLinkCount, 0), icon: Link2, description: 'Ready for your investors' },
		{ label: 'Viewing now', value: currentViewersPaused ? '—' : currentViewerCount ?? data.viewing.length, icon: Radio, description: currentViewersPaused ? 'Updates paused' : 'Current investor sessions' },
	]);
</script>

<svelte:head><title>Overview · OpenRoom</title></svelte:head>

<PageHeading title="Overview" description="Your rooms and investor activity." eyebrow="Workspace">
	{#snippet actions()}{#if data.member?.role !== 'observer'}<Button href="/admin/rooms?new=1" size="sm" class="min-h-10"><Plus data-icon="inline-start" />New room</Button>{/if}{/snippet}
</PageHeading>

<Card.Root class="mb-5 gap-0 py-0 shadow-none sm:hidden"><Card.Header class="sr-only"><Card.Title>Workspace summary</Card.Title></Card.Header><Card.Content class="p-4"><dl class="grid grid-cols-2 gap-x-6 gap-y-3">{#each stats as stat (stat.label)}<div class="flex items-center justify-between gap-2"><dt class="text-xs text-muted-foreground">{stat.label}</dt><dd class="text-xl font-semibold tabular-nums">{stat.value}</dd></div>{/each}</dl></Card.Content></Card.Root>

<div class="mb-7 hidden grid-cols-4 gap-3 sm:grid">
	{#each stats as stat (stat.label)}
		<Card.Root class="gap-0 py-0 shadow-none">
			<Card.Header class="flex h-12 flex-row items-center justify-between px-3 pt-3 pb-2 sm:h-auto sm:px-5 sm:pt-5 sm:pb-3"><Card.Title class="text-[10px] leading-tight font-medium text-muted-foreground sm:text-xs">{stat.label}</Card.Title><stat.icon class="hidden size-4 text-muted-foreground/70 sm:block" strokeWidth={1.7} /></Card.Header>
			<Card.Content class="px-3 pb-3 sm:px-5 sm:pb-5"><p class="text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-[30px]">{stat.value}</p><p class="mt-2.5 hidden text-[11px] text-muted-foreground sm:block">{stat.description}</p></Card.Content>
		</Card.Root>
	{/each}
</div>

<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root class="gap-0 overflow-hidden py-0 shadow-none">
			<Card.Header class="flex flex-row items-center justify-between gap-4 border-b px-4 py-4 sm:px-5"><div class="min-w-0"><Card.Title class="text-sm">Your data rooms</Card.Title><Card.Description class="mt-1 hidden text-xs sm:block">Keep every stage of the conversation organized.</Card.Description></div><a href="/admin/rooms" class="flex min-h-10 shrink-0 items-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground hover:text-foreground">View all<ArrowRight class="size-3.5" /></a></Card.Header>
			<Card.Content class="px-0">
				{#if data.rooms.length === 0}
					<Empty.Root class="py-12"><Empty.Header><Empty.Media variant="icon"><FolderClosed /></Empty.Media><Empty.Title>Your first room starts here</Empty.Title><Empty.Description>Bring your documents together, then share a personal link with each investor.</Empty.Description></Empty.Header>{#if data.member?.role !== 'observer'}<Empty.Content><Button href="/admin/rooms?new=1" size="sm"><Plus data-icon="inline-start" />Create a data room</Button></Empty.Content>{/if}</Empty.Root>
				{:else}
					<div class="divide-y">
						{#each data.rooms.slice(0, 5) as room (room.id)}
							<a href="/admin/rooms/{room.id}" class="group flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5 sm:py-[18px]">
								<span class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary"><FolderClosed class="size-[19px]" strokeWidth={1.5} /></span>
								<span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{room.name}</span><span class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>{room.fileCount} document{room.fileCount === 1 ? '' : 's'}</span><span>{room.activeLinkCount} active link{room.activeLinkCount === 1 ? '' : 's'}</span></span></span>
								<span class="hidden text-right sm:block"><span class="text-xs font-medium">{room.viewersLast7Days}</span><span class="ml-1.5 text-[11px] text-muted-foreground">investors this week</span></span><ChevronRight class="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
							</a>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
		<Card.Root class="gap-0 overflow-hidden py-0 shadow-none">
			<Card.Header class="flex flex-row items-center justify-between border-b px-5 py-4"><div><Card.Title class="text-sm">Recent activity</Card.Title><Card.Description class="mt-1 text-xs">The latest moments across your rooms.</Card.Description></div><Activity class="size-4 text-muted-foreground" strokeWidth={1.6} /></Card.Header>
			<Card.Content class="px-5 py-2">
				{#if data.notices.length === 0}<p class="py-7 text-center text-xs text-muted-foreground">Investor visits, questions and downloads will appear here.</p>{:else}
					<ul class="divide-y">{#each data.notices.slice(0, 5) as notice (notice.id)}<li class="flex gap-3 py-3.5"><span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Activity class="size-3.5" /></span><div class="min-w-0 flex-1"><a class="line-clamp-2 text-xs leading-relaxed hover:underline" href={notice.href}>{notice.text}</a><p class="mt-1 text-[10px] text-muted-foreground"><When at={notice.createdAt} timeZone={data.timeZone} /></p></div>{#if !notice.read}<span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary"></span>{/if}</li>{/each}</ul>
				{/if}
			</Card.Content>
			<Card.Footer class="border-t px-5 py-3"><a href="/admin/notifications" class="flex items-center gap-1.5 text-xs font-medium">All activity<ArrowRight class="size-3" /></a></Card.Footer>
		</Card.Root>
	</div>
	<div class="flex flex-col gap-5">
		<Card.Root class="gap-0 py-0 shadow-none">
			<Card.Header class="px-5 pt-5 pb-4"><div class="mb-3 flex items-center justify-between"><ShieldCheck class="size-5 text-primary" strokeWidth={1.6} /><Badge variant="outline">Your server. Your data.</Badge></div><Card.Title class="text-sm">Make yourself at home</Card.Title><Card.Description class="mt-1 text-xs leading-relaxed">A little setup goes a long way. These services are optional.</Card.Description></Card.Header>
			<Card.Content class="flex flex-col gap-0 px-5 pb-2">
				{#each [{ title: 'Email delivery', detail: 'Verification, invites and replies', ready: data.emailReady, href: '/admin/settings#email', icon: Mail }, { title: 'Storage & backups', detail: 'Keep a copy beyond this server', ready: data.system?.backupsReady, href: '/admin/settings/storage', icon: ShieldCheck }] as item (item.title)}
					<div class="flex items-center gap-3 border-t py-4"><item.icon class="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} /><div class="min-w-0 flex-1"><p class="text-xs font-medium">{item.title}</p><p class="mt-0.5 text-[10px] text-muted-foreground">{item.detail}</p></div>{#if item.ready}<span class="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary" title="Configured"><Check class="size-3" /></span>{:else if owner}<a href={item.href} class="text-xs font-medium text-primary hover:underline">Set up</a>{:else}<Circle class="size-3 text-muted-foreground" />{/if}</div>
				{/each}
			</Card.Content>
		</Card.Root>
		<ViewingNow initial={data.viewing} onchange={(count, paused) => { currentViewerCount = count; currentViewersPaused = paused; }} />
	</div>
</div>
