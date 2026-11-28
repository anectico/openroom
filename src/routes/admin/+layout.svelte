<script lang="ts">
	import { ArrowUpRight, Bell, ChevronDown, ChevronRight, CircleHelp, FolderClosed, Inbox, KeyRound, LayoutDashboard, LogOut, Menu, Monitor, Moon, ScrollText, Settings, ShieldAlert, ShieldCheck, Sun, UserRound, Users, X } from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import Brand from '#lib/admin/Brand.svelte';
	import { act } from '#lib/admin/op.ts';
	import UploadTray from '#lib/admin/UploadTray.svelte';
	import { uploads } from '#lib/admin/uploads.svelte.ts';
	import When from '#lib/admin/When.svelte';
	import OpenRoomCredit from '#lib/components/OpenRoomCredit.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { cn } from '#lib/utils.js';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import type { Theme } from './+layout.server.ts';

	let { data, children } = $props();
	let menuOpen = $state(false);
	const guide = 'https://github.com/anectico/openroom/blob/main/docs/using-openroom.md';
	const nav = [
		{ href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
		{ href: '/admin/rooms', label: 'Data rooms', icon: FolderClosed },
		{ href: '/admin/investors', label: 'Investors', icon: Users },
		{ href: '/admin/notifications', label: 'Notifications', icon: Bell },
		{ href: '/admin/audit', label: 'Audit log', icon: ScrollText },
	];
	const active = (item: { href: string; exact?: boolean }) => item.exact ? page.url.pathname === item.href : page.url.pathname === item.href || page.url.pathname.startsWith(`${item.href}/`);
	const settingsActive = $derived(active({ href: '/admin/settings' }));
	const initials = $derived((data.member?.name || data.member?.email || 'O').split(/[\s@]+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase());
	const currentRoomId = $derived(page.url.pathname.match(/^\/admin\/rooms\/([^/]+)/)?.[1]);
	const currentRoom = $derived(data.sidebarRooms.find((r) => r.id === currentRoomId));
	const roomAttention = $derived(new Map((data.attention?.rooms ?? []).map((r) => [r.roomId, r.total])));
	const roomSections: [RegExp, string[]][] = [
		[/^\/links/, ['Sharing']],
		[/^\/activity/, ['Analytics']],
		[/^\/questions/, ['Questions']],
		[/^\/requests/, ['File requests']],
		[/^\/archive/, ['Archive']],
		[/^(\/settings)?\/groups/, ['Settings', 'Groups']],
		[/^(\/settings)?\/defaults/, ['Settings', 'Link defaults']],
		[/^(\/settings)?\/nda/, ['Settings', 'NDA']],
		[/^\/settings/, ['Settings', 'General']],
	];
	const roomPaths: Record<string, string> = { Sharing: '/links', Analytics: '/activity', Questions: '/questions', 'File requests': '/requests', Archive: '/archive', Settings: '/settings' };
	const settingsPages: Record<string, string> = { storage: 'Storage & backups', members: 'Members', webhooks: 'Webhooks', 'api-keys': 'API keys' };
	const crumbs = $derived.by(() => {
		if (currentRoom) {
			const base = `/admin/rooms/${currentRoom.id}`;
			const rest = page.url.pathname.slice(base.length);
			const labels = roomSections.find(([pattern]) => pattern.test(rest))?.[1] ?? ['Documents'];
			return [{ label: 'Data rooms', href: '/admin/rooms' }, { label: currentRoom.name, href: base }, ...labels.map((label, index) => ({ label, href: index === labels.length - 1 ? page.url.pathname : `${base}${roomPaths[label] ?? ''}` }))];
		}
		const item = nav.find(active);
		if (item) return [{ label: 'Workspace', href: '/admin' }, { label: item.label, href: item.href }];
		if (settingsActive) {
			const sub = settingsPages[page.url.pathname.split('/')[3] ?? ''];
			return [{ label: 'Workspace', href: '/admin' }, { label: 'Settings', href: '/admin/settings' }, ...(sub ? [{ label: sub, href: page.url.pathname }] : [])];
		}
		return [{ label: 'Workspace', href: '/admin' }, { label: 'My account', href: '/admin/account' }];
	});

	let theme = $state<Theme>(untrack(() => data.theme));
	function applyTheme(next: Theme) {
		const root = document.documentElement;
		root.dataset.theme = next;
		root.classList.toggle('dark', next === 'dark' || (next === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
	}
	function setTheme(next: string) {
		if (next !== 'light' && next !== 'dark' && next !== 'system') return;
		theme = next;
		void fetch('/admin/theme', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: next }).catch(() => {});
		applyTheme(next);
	}
	onMount(() => {
		const query = matchMedia('(prefers-color-scheme: dark)');
		const change = () => applyTheme(theme);
		applyTheme(theme);
		query.addEventListener('change', change);
		return () => {
			query.removeEventListener('change', change);
			document.documentElement.classList.remove('dark');
			delete document.documentElement.dataset.theme;
		};
	});

	const backupKey = 'openroom:backup-notice-hidden';
	let backupHidden = $state(false);
	onMount(() => {
		try { backupHidden = sessionStorage.getItem(backupKey) === '1'; } catch {}
	});
	function hideBackup() {
		backupHidden = true;
		try { sessionStorage.setItem(backupKey, '1'); } catch {}
	}
	const urgent = $derived((data.system?.warnings ?? []).filter((w) => w.code !== 'backups_local' && w.code !== 'files_moving'));
	const backupsLocal = $derived(data.system?.warnings.find((w) => w.code === 'backups_local'));
	const moving = $derived(data.system?.warnings.find((w) => w.code === 'files_moving'));
	const owner = $derived(data.member?.role === 'owner');

	async function signOut() {
		await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
		location.href = '/admin/login';
	}
</script>

<Toaster richColors position="top-center" />

{#snippet footerLinks()}
	<a href="/admin/settings" onclick={() => (menuOpen = false)} aria-current={settingsActive ? 'page' : undefined} class={cn('flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors', settingsActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}><Settings class="size-[17px]" strokeWidth={1.7} />Settings</a>
	<a href={guide} target="_blank" rel="noreferrer" class="flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"><CircleHelp class="size-[17px]" strokeWidth={1.7} />User guide<ArrowUpRight class="ml-auto size-3" /><span class="sr-only"> (opens in a new tab)</span></a>
{/snippet}

{#snippet navigation()}
	<p class="mb-3 px-3 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Workspace</p>
	<nav class="flex flex-col gap-1" aria-label="Main">
		{#each nav as item (item.href)}
			<a href={item.href} onclick={() => (menuOpen = false)} class={cn('flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors', active(item) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')} aria-current={active(item) ? 'page' : undefined}>
				<item.icon class="size-[17px] shrink-0" strokeWidth={1.7} />
				<span>{item.label}</span>
				{#if item.href === '/admin/notifications' && data.notificationPreview.unread}<span class="ml-auto flex min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-xs font-semibold text-primary">{data.notificationPreview.unread}<span class="sr-only"> unread</span></span>{/if}
				{#if item.href === '/admin' && data.attention?.total}<span class="ml-auto flex min-w-5 items-center justify-center rounded-md bg-attention px-1 text-xs font-semibold text-attention-foreground">{data.attention.total}<span class="sr-only"> need attention</span></span>{/if}
			</a>
		{/each}
	</nav>
	{#if data.sidebarRooms.length}
		<div class="mt-8">
			<div class="mb-3 flex items-center justify-between px-3"><p class="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Your rooms</p><span class="text-xs text-muted-foreground">{data.sidebarRooms.length}</span></div>
			<nav class="flex flex-col gap-1" aria-label="Your rooms">
				{#each data.sidebarRooms.slice(0, 5) as room (room.id)}
					{@const open = roomAttention.get(room.id) ?? 0}
					<a href="/admin/rooms/{room.id}" onclick={() => (menuOpen = false)} aria-current={currentRoomId === room.id ? 'page' : undefined} class={cn('flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors', currentRoomId === room.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')} title={room.name}>
						<span class={cn('size-1.5 shrink-0 rounded-full', room.frozenAt ? 'bg-muted-foreground/40' : 'bg-primary/60')}></span><span class="min-w-0 flex-1 truncate">{room.name}</span>
						{#if open}<span class="flex min-w-5 shrink-0 items-center justify-center rounded-md bg-attention px-1 text-xs font-semibold text-attention-foreground">{open}<span class="sr-only"> need attention</span></span>{/if}
					</a>
				{/each}
				<a href="/admin/rooms" onclick={() => (menuOpen = false)} class="flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">All rooms{#if data.sidebarRooms.length > 5}<span class="text-muted-foreground">({data.sidebarRooms.length})</span>{/if}<ChevronRight class="ml-auto size-3.5" /></a>
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
			<div class="mt-5 flex flex-col gap-1 border-t pt-4">{@render footerLinks()}</div>
			<p class="mt-5 px-3 text-xs text-muted-foreground"><OpenRoomCredit /></p>
		</aside>
		<div class="min-w-0 lg:ml-[228px]">
			<header class="flex h-14 items-center justify-between gap-3 border-b bg-card px-4 sm:h-[68px] sm:px-7 lg:px-9">
				<div class="flex min-w-0 items-center gap-3">
					<Dialog.Root bind:open={menuOpen}>
						<Dialog.Trigger class="lg:hidden">{#snippet child({ props })}<Button {...props} variant="ghost" size="icon" class="size-11 lg:hidden" aria-label="Open workspace navigation"><Menu /></Button>{/snippet}</Dialog.Trigger>
						<Dialog.Content class="max-h-[90dvh] max-w-sm overflow-y-auto"><Dialog.Header><Dialog.Title><Brand /></Dialog.Title><Dialog.Description>Workspace navigation</Dialog.Description></Dialog.Header>{@render navigation()}<div class="flex flex-col gap-1 border-t pt-3">{@render footerLinks()}</div></Dialog.Content>
					</Dialog.Root>
					<nav aria-label="Breadcrumb" class="min-w-0">
						<ol class="flex min-w-0 items-center gap-1.5 text-xs">
							{#each crumbs as crumb, index (index)}
								{@const last = index === crumbs.length - 1}
								<li class={cn('flex min-w-0 items-center gap-1.5', !last && index < crumbs.length - 2 && 'hidden sm:flex')}>
									{#if index > 0}<ChevronRight class={cn('size-3.5 shrink-0 text-muted-foreground/50', index === crumbs.length - 2 && 'hidden sm:block')} aria-hidden="true" />{/if}
									{#if last}<a href={crumb.href} aria-current="page" class="truncate font-medium">{crumb.label}</a>{:else}<a href={crumb.href} class="truncate text-muted-foreground hover:text-foreground hover:underline">{crumb.label}</a>{/if}
								</li>
							{/each}
						</ol>
					</nav>
				</div>
				<div class="flex shrink-0 items-center gap-3">
					<DropdownMenu.Root onOpenChange={(open) => { if (open) void invalidate('openroom:notifications'); }}>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="icon" class="relative size-11" aria-label={data.notificationPreview.unread ? `Notifications, ${data.notificationPreview.unread} unread` : 'Notifications'}>
									<Bell class="size-[17px]" strokeWidth={1.7} />
									{#if data.notificationPreview.unread}<span class="absolute top-2 right-2 size-1.5 rounded-full bg-primary"></span>{/if}
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-80">
							<DropdownMenu.Group>
								<DropdownMenu.Label>Recent notifications</DropdownMenu.Label>
								{#each data.notificationPreview.notices as notice (notice.id)}
									<DropdownMenu.Item class="items-start py-2" onSelect={async () => {
										if (!notice.read) await act('mark_notices_read', { ids: [notice.id] });
										await goto(notice.href);
									}}>
										<Bell aria-hidden="true" class="mt-0.5 text-muted-foreground" />
										<span class="grid min-w-0 gap-1 whitespace-normal">
											<span class={notice.read ? 'text-muted-foreground' : 'font-medium'}>{notice.text}</span>
											<span class="flex items-center gap-2 text-xs text-muted-foreground">
												{#if !notice.read}<span class="text-primary">New</span>{/if}
												<When at={notice.createdAt} timeZone={data.timeZone} />
											</span>
										</span>
									</DropdownMenu.Item>
								{:else}
									<p class="px-2 py-3 text-sm text-muted-foreground">No notifications yet.</p>
								{/each}
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => goto('/admin/notifications')}><Inbox aria-hidden="true" />View all notifications</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm" class="gap-2 px-1.5" aria-label="Account menu"><span class="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{initials}</span><span class="hidden max-w-28 truncate text-xs sm:inline">{data.member?.name || data.member?.email}</span><ChevronDown data-icon="inline-end" /></Button>{/snippet}</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-56">
							<DropdownMenu.Group><DropdownMenu.Label>Signed in as {data.member.role}</DropdownMenu.Label><DropdownMenu.Item onSelect={() => goto('/admin/account')}><UserRound aria-hidden="true" />My account</DropdownMenu.Item><DropdownMenu.Item onSelect={() => goto('/admin/settings/api-keys')}><KeyRound aria-hidden="true" />API keys</DropdownMenu.Item></DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
								<DropdownMenu.GroupHeading>Theme</DropdownMenu.GroupHeading>
								<DropdownMenu.RadioGroup value={theme} onValueChange={setTheme}>
									<DropdownMenu.RadioItem value="light" closeOnSelect={false}><Sun aria-hidden="true" />Light</DropdownMenu.RadioItem>
									<DropdownMenu.RadioItem value="dark" closeOnSelect={false}><Moon aria-hidden="true" />Dark</DropdownMenu.RadioItem>
									<DropdownMenu.RadioItem value="system" closeOnSelect={false}><Monitor aria-hidden="true" />System</DropdownMenu.RadioItem>
								</DropdownMenu.RadioGroup>
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Group><DropdownMenu.Item onSelect={signOut}><LogOut />Sign out</DropdownMenu.Item></DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</header>
			<main id="main-content" class={cn('mx-auto max-w-[1440px] px-4 py-4 sm:px-7 sm:py-8 lg:px-9', uploads.items.length && 'pb-28 sm:pb-32')}>
				{#if urgent.length}
					<section class="mb-4 flex flex-col gap-2 sm:mb-6" aria-label="Server status">
						{#each urgent as warning (warning.code)}<Alert.Root role="alert" variant="destructive" class="bg-card"><ShieldAlert /><Alert.Description class="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{warning.text}</span>{#if owner}<a href={warning.href} class="flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 sm:min-h-8">Check storage</a>{/if}</Alert.Description></Alert.Root>{/each}
					</section>
				{/if}
				{#if (backupsLocal || moving) && !backupHidden}
					<div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-attention px-3 py-1.5 text-xs text-attention-foreground sm:mb-6" role="status">
						<ShieldCheck class="size-4 shrink-0" aria-hidden="true" />
						<span class="min-w-0 flex-1">{backupsLocal ? 'Documents and backups are only on this server. Add S3 storage to keep a copy elsewhere.' : moving?.text}</span>
						{#if owner}<a href={(backupsLocal ?? moving)?.href} class="flex min-h-11 items-center font-semibold underline underline-offset-4 sm:min-h-8">{backupsLocal ? 'Set up' : 'View progress'}</a>{/if}
						<Button variant="ghost" size="icon-sm" class="text-attention-foreground hover:bg-attention-foreground/10 hover:text-attention-foreground" aria-label="Hide for now" title="Hide for now" onclick={hideBackup}><X /></Button>
					</div>
				{/if}
				{@render children()}
			</main>
		</div>
		<UploadTray rooms={data.sidebarRooms} />
	</div>
{:else}
	{@render children()}
{/if}
