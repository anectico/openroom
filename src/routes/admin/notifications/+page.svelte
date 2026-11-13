<script lang="ts">
	import { act } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';

	let { data } = $props();
	const unread = $derived(data.notices.filter((n) => !n.read).length);

</script>

<svelte:head><title>Notifications · OpenRoom</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
	<h1 class="text-2xl font-semibold">Notifications</h1>
	{#if unread}<Button variant="outline" size="sm" onclick={() => act('mark_notices_read', { all: true })}>Mark all as read</Button>{/if}
</div>

<ul class="mb-10 divide-y rounded-lg border bg-background">
	{#each data.notices as n (n.id)}
		<li class="flex flex-col gap-2 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
	{:else}
		<li class="p-8 text-center text-muted-foreground">No notifications yet.</li>
	{/each}
</ul>

<h2 class="mb-1 text-lg font-medium">Email me when</h2>
<p class="mb-3 text-sm text-muted-foreground">
	{data.emailReady ? 'Your choices; other members choose their own.' : 'Needs email: ask an owner to set it up in Settings.'}
</p>
<ul class="max-w-xl divide-y rounded-lg border bg-background">
	{#each data.prefs as p (p.event)}
		<li class="flex items-center justify-between px-4 py-3 text-sm">
			<label for="pref-{p.event}">{p.label}</label>
			<Switch
				id="pref-{p.event}"
				checked={p.email}
				disabled={!data.emailReady}
				onCheckedChange={(v) => act('set_notification_pref', { event: p.event, email: v }, 'Saved')}
			/>
		</li>
	{/each}
</ul>
