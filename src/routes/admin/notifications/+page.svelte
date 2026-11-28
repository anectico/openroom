<script lang="ts">
	import {
		Archive, Bell, BookOpen, Check, CheckCheck, ChevronRight, DatabaseBackup, Download, Eye, FileCheck2,
		FileUp, HardDrive, Inbox, Link2, Mail, MailWarning, MessageSquare, Snowflake,
	} from '@lucide/svelte';
	import { act } from '#lib/admin/op.ts';
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import When from '#lib/admin/When.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';

	let { data } = $props();
	const events: Record<string, { label: string; icon: typeof Bell; attention?: boolean }> = {
		first_open: { label: 'First visit', icon: Link2 },
		visit: { label: 'Room visit', icon: Eye },
		nda_accepted: { label: 'NDA accepted', icon: FileCheck2 },
		read_past: { label: 'Reading milestone', icon: BookOpen },
		download: { label: 'Download', icon: Download },
		question: { label: 'Question activity', icon: MessageSquare },
		request_upload: { label: 'File request upload', icon: FileUp },
		room_frozen: { label: 'Room frozen', icon: Snowflake },
		archive_ready: { label: 'Archive ready', icon: Archive },
		email_cap: { label: 'Email limit reached', icon: MailWarning, attention: true },
		replication_stopped: { label: 'Backup needs attention', icon: DatabaseBackup, attention: true },
		disk_low: { label: 'Low disk space', icon: HardDrive, attention: true },
	};
	let markingAll = $state(false);
	let marking = $state<number[]>([]);

	async function markRead(id: number) {
		if (marking.includes(id) || markingAll) return;
		marking = [...marking, id];
		await act('mark_notices_read', { ids: [id] });
		marking = marking.filter((pending) => pending !== id);
	}

	async function markAll() {
		if (markingAll) return;
		markingAll = true;
		await act('mark_notices_read', { all: true }, 'All notifications marked as read');
		markingAll = false;
	}
</script>

<svelte:head><title>Notifications · OpenRoom</title></svelte:head>

<PageHeading title="Notifications" description="Investor visits, NDA acceptances, questions, downloads and server notices, newest first." eyebrow="Workspace">
	{#snippet actions()}<Button href="/admin/account#email-preferences" variant="outline"><Mail aria-hidden="true" />Email preferences</Button>{/snippet}
</PageHeading>

<section aria-label="Notification inbox" class="@container/inbox overflow-hidden rounded-xl border bg-card">
	<header class="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/25 px-4 py-3 sm:px-5">
		<nav aria-label="Inbox views" class="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
			{#each [{ label: 'All', href: '/admin/notifications', unread: false }, { label: 'Unread', href: '?view=unread', unread: true }] as view (view.label)}
				<a href={view.href} aria-current={view.unread === data.unreadOnly ? 'page' : undefined}
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm">
					{view.label}{#if view.unread}<span class="rounded-md bg-primary/10 px-1.5 text-xs tabular-nums text-primary">{data.unread}</span>{/if}
				</a>
			{/each}
		</nav>
		{#if data.unread}
			<Button variant="ghost" size="sm" disabled={markingAll} onclick={markAll}><CheckCheck aria-hidden="true" />Mark all as read</Button>
		{/if}
	</header>

	{#if data.notices.length}
		<ul class="divide-y">
			{#each data.notices as notice (notice.id)}
				{@const event = events[notice.event] ?? { label: 'Notification', icon: Bell }}
				<li class="relative flex items-center gap-1 px-3 hover:bg-muted/25 sm:px-5">
					<a href={notice.href} onclick={() => !notice.read && markRead(notice.id)}
						class="group grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 rounded-md py-4 after:absolute after:inset-0 focus-visible:outline-ring @min-[34rem]/inbox:grid-cols-[auto_minmax(0,1fr)_auto]">
						<span class={cn('row-span-2 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground', !notice.read && 'bg-primary/10 text-primary', event.attention && 'bg-attention/15 text-attention-foreground')}>
							<event.icon aria-hidden="true" class="size-4" />
						</span>
						<span class="flex items-center gap-2 text-sm font-medium group-hover:underline">
							{event.label}
							{#if !notice.read}<span class="size-1.5 shrink-0 rounded-full bg-primary"></span><span class="sr-only">Unread</span>{/if}
						</span>
						<span class="col-start-2 mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{notice.text}</span>
						<span class="col-start-2 mt-1 text-xs text-muted-foreground @min-[34rem]/inbox:col-start-3 @min-[34rem]/inbox:row-span-2 @min-[34rem]/inbox:row-start-1 @min-[34rem]/inbox:mt-0 @min-[34rem]/inbox:self-center">
							<When at={notice.createdAt} timeZone={data.timeZone} />
						</span>
					</a>
					{#if !notice.read}
						<Button size="icon" variant="ghost" class="relative z-10 size-11 text-muted-foreground" disabled={markingAll || marking.includes(notice.id)}
							aria-label={`Mark as read: ${notice.text}`} title="Mark as read" onclick={() => markRead(notice.id)}><Check aria-hidden="true" /></Button>
					{:else}
						<span aria-hidden="true" class="pointer-events-none flex w-11 shrink-0 justify-center text-muted-foreground/60"><ChevronRight class="size-4" /></span>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="flex flex-col items-center px-5 py-12 text-center">
			<span class="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Inbox class="size-5" aria-hidden="true" /></span>
			<p class="text-sm font-medium">{data.unreadOnly ? 'No unread notifications' : 'No notifications yet'}</p>
			{#if data.unreadOnly}<a class="mt-2 text-sm text-primary underline-offset-2 hover:underline" href="/admin/notifications">View all notifications</a>
			{:else}<p class="mt-1 max-w-xs text-sm text-muted-foreground">Investor activity and workspace alerts will appear here.</p>{/if}
		</div>
	{/if}
</section>
