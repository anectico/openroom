<script lang="ts">
	import { Inbox } from '@lucide/svelte';
	import { act } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let { data } = $props();
	const unread = $derived(data.notices.filter((n) => !n.read).length);
</script>

<svelte:head><title>Notifications · OpenRoom</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<header class="mb-5 flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold">Notifications</h1>
		<Button href="/admin/account#email-preferences" variant="outline" size="sm">Email preferences</Button>
	</header>

	<section aria-labelledby="inbox-heading" class="@container/inbox rounded-xl border bg-card">
		<header class="flex flex-wrap items-center justify-between gap-2 p-4">
			<h2 id="inbox-heading" class="text-lg font-semibold">Inbox</h2>
			{#if unread}
				<Button variant="outline" size="sm" onclick={() => act('mark_notices_read', { all: true })}>Mark all as read</Button>
			{/if}
		</header>
		{#if data.notices.length}
			<ul class="divide-y border-t">
				{#each data.notices as n (n.id)}
					<li class="flex flex-col gap-2 px-4 py-4 text-sm @min-[30rem]/inbox:flex-row @min-[30rem]/inbox:items-center @min-[30rem]/inbox:justify-between">
						<a
							class="min-w-0 break-words hover:underline {n.read ? 'text-muted-foreground' : 'font-medium'}"
							href={n.href}
							onclick={() => !n.read && act('mark_notices_read', { ids: [n.id] })}>{n.text}</a
						>
						<span class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
							{#if !n.read}<Badge variant="secondary">New</Badge>{/if}
							<When at={n.createdAt} timeZone={data.timeZone} />
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="flex flex-col items-center gap-3 border-t px-4 py-8 text-sm text-muted-foreground">
				<Inbox class="size-6" aria-hidden="true" />
				<p>No notifications yet.</p>
			</div>
		{/if}
	</section>
</div>
