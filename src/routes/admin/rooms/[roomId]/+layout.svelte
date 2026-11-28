<script lang="ts">
	import { ChartColumn, FileText, FolderOpen, Inbox, Link2, MessagesSquare, Palette, Settings, ShieldCheck, Snowflake, Users } from '@lucide/svelte';
	import { act, formatDate } from '#lib/admin/op.ts';
	import SectionNav from '#lib/admin/SectionNav.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { page } from '$app/state';

	let { data, children } = $props();
	const base = $derived(`/admin/rooms/${data.room.id}`);
	const canManage = $derived(data.member?.role !== 'observer');
	const settingsPages = $derived([
		{ href: `${base}/settings`, label: 'General', icon: Palette },
		{ href: `${base}/groups`, label: 'Groups', icon: Users },
		{ href: `${base}/defaults`, label: 'Link defaults', icon: ShieldCheck },
		{ href: `${base}/nda`, label: 'NDA', icon: FileText },
	]);
	const open = $derived(data.attention?.rooms.find((r) => r.roomId === data.room.id));
	const tabs = $derived([
		{ href: base, label: 'Documents', icon: FolderOpen, show: true },
		{ href: `${base}/links`, label: 'Sharing', icon: Link2, show: canManage },
		{ href: `${base}/activity`, label: 'Analytics', icon: ChartColumn, show: true },
		{ href: `${base}/questions`, label: 'Questions', icon: MessagesSquare, show: true, count: open?.questions },
		{ href: `${base}/requests`, label: 'File requests', icon: Inbox, show: true, count: open?.requests },
		{ href: `${base}/settings`, label: 'Settings', icon: Settings, show: true },
	].filter((tab) => tab.show));
	const selected = (href: string) => href === base ? page.url.pathname === base : page.url.pathname.startsWith(href);
	const inSettings = $derived(settingsPages.some((item) => selected(item.href)));
	const activeHref = $derived(inSettings ? `${base}/settings` : tabs.find((tab) => selected(tab.href))?.href);
	const current = $derived(inSettings ? 'Settings' : (tabs.find((tab) => selected(tab.href))?.label ?? 'Documents'));
	const currentSetting = $derived(settingsPages.find((item) => selected(item.href))?.href);
	const expired = $derived(!!data.room.frozenAt && data.room.frozenAt + data.room.frozenRetentionDays * 86_400_000 < Date.now());
	let retrying = $state(false);
	async function retry() {
		retrying = true;
		await act('retry_room_archive', { roomId: data.room.id }, 'Building the archive again');
		retrying = false;
	}
</script>

<header class="mb-4 flex items-center justify-between gap-3 sm:mb-6">
	<h1 class="min-w-0 text-balance break-words text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{data.room.name}</h1>
	{#if canManage}
		<div class="flex shrink-0 items-center gap-2">
			{#if !data.room.frozenAt}
				<Button href="{base}/links?new=1" variant="outline" class="bg-card" aria-label="Share room"><Link2 /><span class="hidden sm:inline">Share room</span><span class="sm:hidden">Share</span></Button>
			{/if}
		</div>
	{/if}
</header>
{#if data.room.frozenAt}
	<Alert.Root class="mb-5"><Snowflake /><Alert.Title>This room is frozen</Alert.Title><Alert.Description><span>Read only since {formatDate(data.room.frozenAt, data.timeZone)}.</span>{#if data.archive?.downloadUrl}<a class="ml-2 font-medium underline" href={data.archive.downloadUrl}>Download the archive</a>{:else if expired}<span>The archive’s retention period has ended.</span>{:else if !data.archive || ['failed', 'none'].includes(data.archive.status)}<span>The archive could not be built.</span>{#if canManage}<Button size="sm" variant="outline" disabled={retrying} onclick={retry}>Try again</Button>{/if}{:else}<span>Preparing the archive…</span>{/if}</Alert.Description></Alert.Root>
{/if}
<SectionNav label="Room" {tabs} {activeHref} {current} />
{#if inSettings}
	<nav aria-label="Room settings" class="-mt-1 mb-5 flex flex-wrap gap-1.5 sm:mb-6">
		{#each settingsPages as item (item.href)}
			<a
				href={item.href}
				aria-current={currentSetting === item.href ? 'page' : undefined}
				class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:min-h-9 aria-[current=page]:border-primary/45 aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
			><item.icon aria-hidden="true" class="size-4" />{item.label}</a>
		{/each}
	</nav>
{/if}
{#key data.room.id}{@render children()}{/key}
