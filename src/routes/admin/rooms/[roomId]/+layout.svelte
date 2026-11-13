<script lang="ts">
	import { ChevronDown, FolderClosed, Link2, Settings2, Snowflake } from '@lucide/svelte';
	import { act, formatDate } from '#lib/admin/op.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { cn } from '#lib/utils.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children } = $props();
	const base = $derived(`/admin/rooms/${data.room.id}`);
	const canManage = $derived(data.member?.role !== 'observer');
	const tabs = $derived([
		{ href: base, label: 'Documents', show: true },
		{ href: `${base}/links`, label: 'Sharing', show: canManage },
		{ href: `${base}/activity`, label: 'Analytics', show: true },
		{ href: `${base}/questions`, label: 'Questions', show: true },
		{ href: `${base}/requests`, label: 'File requests', show: true },
	].filter((tab) => tab.show));
	const settings = $derived([
		{ href: `${base}/groups`, label: 'Investor groups & permissions' },
		{ href: `${base}/defaults`, label: 'Default link protection' },
		{ href: `${base}/nda`, label: 'Non-disclosure agreement' },
		{ href: `${base}/settings`, label: 'Room settings & branding' },
	]);
	const selected = (href: string) => href === base ? page.url.pathname === base : page.url.pathname.startsWith(href);
	const current = $derived([...tabs, ...settings].find((tab) => selected(tab.href))?.label ?? 'Documents');
	const expired = $derived(!!data.room.frozenAt && data.room.frozenAt + data.room.frozenRetentionDays * 86_400_000 < Date.now());
	let retrying = $state(false);
	async function retry() {
		retrying = true;
		await act('retry_room_archive', { roomId: data.room.id }, 'Building the archive again');
		retrying = false;
	}
</script>

<div class="mb-4 flex items-start justify-between gap-3 sm:mb-6 sm:items-center sm:gap-4">
	<div class="flex min-w-0 flex-1 items-center gap-3.5">
		<span class="hidden size-12 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary sm:flex"><FolderClosed class="size-6" strokeWidth={1.4} /></span>
		<div class="min-w-0"><div class="mb-1.5 hidden items-center gap-2 sm:flex"><a href="/admin/rooms" class="text-[10px] font-medium tracking-[0.13em] text-muted-foreground uppercase hover:text-foreground">Data room</a>{#if data.room.frozenAt}<Badge variant="outline"><Snowflake />Frozen</Badge>{/if}</div><h1 class="break-words text-[22px] leading-tight font-semibold tracking-[-0.035em] sm:text-[30px]">{data.room.name}</h1><p class="mt-1.5 text-[11px] text-muted-foreground sm:mt-2 sm:text-xs">{data.room.fileCount} document{data.room.fileCount === 1 ? '' : 's'}<span class="mx-2 text-border">/</span><span class="sm:hidden">{data.room.activeLinkCount} link{data.room.activeLinkCount === 1 ? '' : 's'}</span><span class="hidden sm:inline">{data.room.activeLinkCount} active sharing link{data.room.activeLinkCount === 1 ? '' : 's'}</span>{#if data.room.frozenAt}<span class="ml-2 sm:hidden">· Frozen</span>{/if}</p></div>
	</div>
	{#if canManage && !data.room.frozenAt}<Button href="{base}/links?new=1" size="sm" class="min-h-11 sm:min-h-9" aria-label="Share room"><Link2 data-icon="inline-start" /><span class="sm:hidden">Share</span><span class="hidden sm:inline">Share room</span></Button>{/if}
</div>
{#if data.room.frozenAt}
	<Alert.Root class="mb-5"><Snowflake /><Alert.Title>This room is frozen</Alert.Title><Alert.Description><span>Read only since {formatDate(data.room.frozenAt, data.timeZone)}.</span>{#if data.archive?.downloadUrl}<a class="ml-2 font-medium underline" href={data.archive.downloadUrl}>Download the archive</a>{:else if expired}<span>The archive’s retention period has ended.</span>{:else if !data.archive || ['failed', 'none'].includes(data.archive.status)}<span>The archive could not be built.</span>{#if canManage}<Button size="sm" variant="outline" disabled={retrying} onclick={retry}>Try again</Button>{/if}{:else}<span>Preparing the archive…</span>{/if}</Alert.Description></Alert.Root>
{/if}
<div class="mb-4 flex items-center justify-between gap-2 border-b sm:mb-6">
	<nav class="hidden min-w-0 gap-1 overflow-x-auto sm:flex" aria-label="Room">
		{#each tabs as tab (tab.href)}<a href={tab.href} class={cn('-mb-px flex h-11 shrink-0 items-center border-b-2 px-4 text-xs font-medium transition-colors', selected(tab.href) ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')} aria-current={selected(tab.href) ? 'page' : undefined}>{tab.label}</a>{/each}
	</nav>
	<div class="min-w-0 sm:hidden"><DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" class="h-11 max-w-full px-0" aria-label="Room section: {current}"><span class="truncate">{current}</span><ChevronDown data-icon="inline-end" /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content><DropdownMenu.Group>{#each tabs as tab (tab.href)}<DropdownMenu.Item onSelect={() => goto(tab.href)}>{tab.label}</DropdownMenu.Item>{/each}</DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root></div>
	{#if canManage}<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm" class="min-h-11 shrink-0 sm:min-h-8" aria-label="Room settings"><Settings2 data-icon="inline-start" /><span class="md:hidden">Options</span><span class="hidden md:inline">Room settings</span><ChevronDown data-icon="inline-end" /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end"><DropdownMenu.Group><DropdownMenu.Label>Manage this room</DropdownMenu.Label>{#each settings as tab (tab.href)}<DropdownMenu.Item onSelect={() => goto(tab.href)}>{tab.label}</DropdownMenu.Item>{/each}</DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root>{/if}
</div>
{#key data.room.id}{@render children()}{/key}
