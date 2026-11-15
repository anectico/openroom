<script lang="ts">
	import { ChartColumn, FileText, FolderOpen, Inbox, Link2, MessagesSquare, Palette, Settings, ShieldCheck, Snowflake, Users } from '@lucide/svelte';
	import { act, formatDate } from '#lib/admin/op.ts';
	import SectionNav from '#lib/admin/SectionNav.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children } = $props();
	const base = $derived(`/admin/rooms/${data.room.id}`);
	const canManage = $derived(data.member?.role !== 'observer');
	const tabs = $derived([
		{ href: base, label: 'Documents', icon: FolderOpen, show: true },
		{ href: `${base}/links`, label: 'Sharing', icon: Link2, show: canManage },
		{ href: `${base}/activity`, label: 'Analytics', icon: ChartColumn, show: true },
		{ href: `${base}/questions`, label: 'Questions', icon: MessagesSquare, show: true },
		{ href: `${base}/requests`, label: 'File requests', icon: Inbox, show: true },
	].filter((tab) => tab.show));
	const settings = $derived([
		{
			label: 'General',
			items: [{ href: `${base}/settings`, label: 'Room settings & branding', icon: Palette }],
		},
		{
			label: 'Investor access',
			items: [
				{ href: `${base}/groups`, label: 'Investor groups & permissions', icon: Users },
				{ href: `${base}/defaults`, label: 'Default link protection', icon: ShieldCheck },
				{ href: `${base}/nda`, label: 'Non-disclosure agreement', icon: FileText },
			],
		},
	]);
	const selected = (href: string) => href === base ? page.url.pathname === base : page.url.pathname.startsWith(href);
	const current = $derived([...tabs, ...settings.flatMap((group) => group.items)].find((tab) => selected(tab.href))?.label ?? 'Documents');
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
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="icon" class="size-11 bg-card sm:size-9" aria-label="Room settings" title="Room settings"><Settings /></Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" sideOffset={6} class="w-72 p-1.5">
					{#each settings as group, index (group.label)}
						{#if index > 0}<DropdownMenu.Separator />{/if}
						<DropdownMenu.Group>
							<DropdownMenu.GroupHeading>{group.label}</DropdownMenu.GroupHeading>
							{#each group.items as item (item.href)}
								<DropdownMenu.Item
									aria-current={selected(item.href) ? 'page' : undefined}
									class="min-h-11 gap-3 sm:min-h-9 aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-primary"
									onSelect={() => goto(item.href)}
								>
									<item.icon aria-hidden="true" class="text-muted-foreground" />
									{item.label}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	{/if}
</header>
{#if data.room.frozenAt}
	<Alert.Root class="mb-5"><Snowflake /><Alert.Title>This room is frozen</Alert.Title><Alert.Description><span>Read only since {formatDate(data.room.frozenAt, data.timeZone)}.</span>{#if data.archive?.downloadUrl}<a class="ml-2 font-medium underline" href={data.archive.downloadUrl}>Download the archive</a>{:else if expired}<span>The archive’s retention period has ended.</span>{:else if !data.archive || ['failed', 'none'].includes(data.archive.status)}<span>The archive could not be built.</span>{#if canManage}<Button size="sm" variant="outline" disabled={retrying} onclick={retry}>Try again</Button>{/if}{:else}<span>Preparing the archive…</span>{/if}</Alert.Description></Alert.Root>
{/if}
<SectionNav label="Room" {tabs} activeHref={tabs.find((tab) => selected(tab.href))?.href} {current} />
{#key data.room.id}{@render children()}{/key}
