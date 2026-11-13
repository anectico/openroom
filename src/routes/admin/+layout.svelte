<script lang="ts">
	import { ArrowUpRight, Bell, ChevronDown, ChevronRight, CircleHelp, FolderClosed, LayoutDashboard, LogOut, Menu, ScrollText, Settings, ShieldCheck, Users } from '@lucide/svelte';
	import Brand from '#lib/admin/Brand.svelte';
	import UploadTray from '#lib/admin/UploadTray.svelte';
	import { uploads } from '#lib/admin/uploads.svelte.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { cn } from '#lib/utils.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children } = $props();
	let menuOpen = $state(false);
	const nav = [
		{ href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
		{ href: '/admin/rooms', label: 'Data rooms', icon: FolderClosed },
		{ href: '/admin/investors', label: 'Investors', icon: Users },
		{ href: '/admin/notifications', label: 'Notifications', icon: Bell },
		{ href: '/admin/audit', label: 'Audit log', icon: ScrollText },
	];
	const active = (item: { href: string; exact?: boolean }) => item.exact ? page.url.pathname === item.href : page.url.pathname === item.href || page.url.pathname.startsWith(`${item.href}/`);
	const section = $derived(nav.find(active)?.label ?? (page.url.pathname.includes('/settings') ? 'Settings' : 'Account'));
	const initials = $derived((data.member?.name || data.member?.email || 'O').split(/[\s@]+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase());
	const currentRoomId = $derived(page.url.pathname.match(/^\/admin\/rooms\/([^/]+)/)?.[1]);
	const currentRoom = $derived(data.sidebarRooms.find((r) => r.id === currentRoomId));
	async function signOut() {
		await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
		location.href = '/admin/login';
	}
</script>

<Toaster richColors position="top-center" />

{#snippet navigation()}
	<p class="mb-3 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Workspace</p>
	<nav class="flex flex-col gap-1" aria-label="Main">
		{#each nav as item (item.href)}
			<a href={item.href} onclick={() => (menuOpen = false)} class={cn('flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors', active(item) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')} aria-current={active(item) ? 'page' : undefined}>
				<item.icon class="size-[17px] shrink-0" strokeWidth={1.7} />
				<span>{item.label}</span>
				{#if item.href === '/admin/notifications' && data.unread}<span class="ml-auto flex min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[10px] font-semibold text-primary">{data.unread}<span class="sr-only"> unread</span></span>{/if}
			</a>
		{/each}
	</nav>
	{#if data.sidebarRooms.length}
		<div class="mt-8">
			<div class="mb-3 flex items-center justify-between px-3"><p class="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Your rooms</p><span class="text-[10px] text-muted-foreground">{data.sidebarRooms.length}</span></div>
			<nav class="flex flex-col gap-1" aria-label="Your rooms">
				{#each data.sidebarRooms.slice(0, 5) as room (room.id)}
					<a href="/admin/rooms/{room.id}" onclick={() => (menuOpen = false)} class={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors', currentRoomId === room.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')} title={room.name}>
						<span class={cn('size-1.5 shrink-0 rounded-full', room.frozenAt ? 'bg-muted-foreground/40' : 'bg-primary/60')}></span><span class="truncate">{room.name}</span>
					</a>
				{/each}
			</nav>
		</div>
	{/if}
{/snippet}

{#if data.member && page.route.id !== '/admin/invite/[token]'}
	<div class="min-h-dvh bg-background">
		<a href="#main-content" class="sr-only fixed top-3 left-3 focus:not-sr-only focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground">Skip to content</a>
		<aside class="fixed inset-y-0 left-0 hidden w-[228px] flex-col border-r bg-sidebar px-4 py-6 lg:flex">
			<a href="/admin" class="mb-9 px-2" aria-label="OpenRoom overview"><Brand /></a>
			<div class="min-h-0 flex-1 overflow-y-auto">{@render navigation()}</div>
			<div class="mt-5 flex flex-col gap-1 border-t pt-4">
				<a href="/admin/settings" class="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"><Settings class="size-[17px]" strokeWidth={1.7} />Settings</a>
				<a href="https://github.com/anectico/openroom" target="_blank" rel="noreferrer" class="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"><CircleHelp class="size-[17px]" strokeWidth={1.7} />Help & docs<ArrowUpRight class="ml-auto size-3" /></a>
			</div>
			<p class="mt-5 px-3 text-[10px] text-muted-foreground">OpenRoom by <span class="font-medium text-foreground/70">Anectico</span></p>
		</aside>
		<div class="min-w-0 lg:ml-[228px]">
			<header class="flex h-14 items-center justify-between gap-3 border-b bg-card px-4 sm:h-[68px] sm:px-7 lg:px-9">
				<div class="flex min-w-0 items-center gap-3">
					<Dialog.Root bind:open={menuOpen}>
						<Dialog.Trigger class="lg:hidden">{#snippet child({ props })}<Button {...props} variant="ghost" size="icon" class="size-11 lg:hidden" aria-label="Open workspace navigation"><Menu /></Button>{/snippet}</Dialog.Trigger>
						<Dialog.Content class="max-h-[90dvh] max-w-sm overflow-y-auto"><Dialog.Header><Dialog.Title><Brand /></Dialog.Title><Dialog.Description>Workspace navigation</Dialog.Description></Dialog.Header>{@render navigation()}<div class="border-t pt-3"><a href="/admin/settings" onclick={() => (menuOpen = false)} class="flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Settings class="size-[17px]" />Settings</a><a href="https://github.com/anectico/openroom" target="_blank" rel="noreferrer" class="flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"><CircleHelp class="size-[17px]" />Help & docs<ArrowUpRight class="ml-auto size-3" /></a></div></Dialog.Content>
					</Dialog.Root>
					<span class="hidden text-xs text-muted-foreground sm:inline">Workspace</span><ChevronRight class="hidden size-3.5 text-muted-foreground/50 sm:block" />
					<a href={nav.find(active)?.href ?? '/admin/settings'} class="truncate text-xs font-medium">{section}</a>
					{#if currentRoom}<ChevronRight class="hidden size-3.5 shrink-0 text-muted-foreground/50 sm:block" /><span class="hidden truncate text-xs text-muted-foreground sm:block">{currentRoom.name}</span>{/if}
				</div>
				<div class="flex shrink-0 items-center gap-3">
					<a href="/admin/notifications" aria-label={data.unread ? `${data.unread} unread notifications` : 'Notifications'} class="relative flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Bell class="size-[17px]" strokeWidth={1.7} />{#if data.unread}<span class="absolute top-2 right-2 size-1.5 rounded-full bg-primary"></span>{/if}</a>
					<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm" class="gap-2 px-1.5"><span class="flex size-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">{initials}</span><span class="hidden max-w-28 truncate text-xs sm:inline">{data.member?.name || data.member?.email}</span><ChevronDown data-icon="inline-end" /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end"><DropdownMenu.Group><DropdownMenu.Label>Signed in as {data.member.role}</DropdownMenu.Label><DropdownMenu.Item onSelect={() => goto('/admin/account')}>My account</DropdownMenu.Item><DropdownMenu.Item onSelect={() => goto('/admin/settings/api-keys')}>API keys</DropdownMenu.Item></DropdownMenu.Group><DropdownMenu.Separator /><DropdownMenu.Group><DropdownMenu.Item onSelect={signOut}><LogOut />Sign out</DropdownMenu.Item></DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root>
				</div>
			</header>
			<main id="main-content" class={cn('mx-auto max-w-[1440px] px-4 py-4 sm:px-7 sm:py-8 lg:px-9', uploads.items.length && 'pb-28 sm:pb-32')}>
                {#if data.system?.warnings.length}
     <section class="mb-4 rounded-xl border bg-card px-3 py-2 sm:mb-6" aria-label="Server status">
      {#each data.system.warnings.filter((warning) => warning.code !== 'backups_local') as warning (warning.code)}<Alert.Root class="border-0 p-0 py-1 shadow-none" role="alert" variant="destructive"><ShieldCheck /><Alert.Description class="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{warning.text}</span>{#if data.member.role === 'owner'}<a href={warning.href} class="flex min-h-8 items-center font-medium text-foreground underline underline-offset-4">View settings</a>{/if}</Alert.Description></Alert.Root>{/each}
      {#each data.system.warnings.filter((warning) => warning.code === 'backups_local') as warning (warning.code)}<details class="text-xs text-muted-foreground"><summary class="flex min-h-8 cursor-pointer items-center gap-2"><ShieldCheck class="size-4" />Backups stay on this server<ChevronDown class="size-3" /></summary><div class="flex flex-wrap items-center justify-between gap-2 pb-2"><p>{warning.text}</p>{#if data.member.role === 'owner'}<a href={warning.href} class="flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">Set up backups</a>{/if}</div></details>{/each}
     </section>
    {/if}
				{@render children()}
			</main>
		</div>
		<UploadTray rooms={data.sidebarRooms} />
	</div>
{:else}
	{@render children()}
{/if}
