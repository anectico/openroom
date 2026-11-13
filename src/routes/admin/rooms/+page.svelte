<script lang="ts">
	import { ArrowRight, FileText, FolderClosed, Link2, Plus, Search, Snowflake, Users } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { attempt } from '#lib/admin/op.ts';
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	let open = $state(false);
	let name = $state('');
	let error = $state('');
	let query = $state('');
	let busy = $state(false);
	const canEdit = $derived(data.member?.role !== 'observer');
	const rooms = $derived(data.rooms.filter((room) => room.name.toLowerCase().includes(query.toLowerCase().trim())));
	const createRequested = $derived(page.url.searchParams.has('new'));
	$effect(() => { if (createRequested) untrack(() => {  open = true; const next = new URL(page.url.href); next.searchParams.delete('new'); replaceState(next, page.state); }); });
	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		try {
			const result = await attempt<{ id: string }>('create_room', { name }, 'Room created');
			if (!result.ok) { error = result.error; return; }
			open = false; name = ''; error = '';
			await goto(`/admin/rooms/${result.data.id}`);
		} finally { busy = false; }
	}
</script>

<svelte:head><title>Data rooms · OpenRoom</title></svelte:head>
<PageHeading title="Your data rooms" description="A dedicated space for every stage of your raise. Organize documents, share access and follow the conversation." eyebrow="Organize & share">
	{#snippet actions()}{#if canEdit}<Button onclick={() => (open = true)}><Plus data-icon="inline-start" />New data room</Button>{/if}{/snippet}
</PageHeading>

{#if data.rooms.length}
	<div class="mb-5 flex items-center justify-between gap-3"><div class="relative w-full max-w-xs"><Search class="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input type="search" aria-label="Search data rooms" placeholder="Find a data room…" class="pl-9" bind:value={query} /></div><span class="shrink-0 text-xs text-muted-foreground">{rooms.length} room{rooms.length === 1 ? '' : 's'}</span></div>
{/if}
{#if rooms.length}
	<div class="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
		{#each rooms as room (room.id)}
			<Card.Root class="group gap-0 overflow-hidden py-0 shadow-none transition-shadow hover:shadow-sm">
				<Card.Header class="px-6 pt-6 pb-5"><div class="mb-5 flex items-center justify-between"><span class="flex size-11 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary"><FolderClosed class="size-[22px]" strokeWidth={1.5} /></span><Badge variant="outline">{#if room.frozenAt}<Snowflake />Frozen{:else}<span class="size-1.5 rounded-full bg-primary"></span>Active{/if}</Badge></div><Card.Title class="text-lg leading-snug tracking-tight"><a href="/admin/rooms/{room.id}" class="hover:text-primary">{room.name}</a></Card.Title><Card.Description class="mt-1 text-xs">{room.frozenAt ? 'Archived and kept for your records.' : 'A private space for your investor documents.'}</Card.Description></Card.Header>
				<Card.Content class="grid grid-cols-3 gap-3 px-6 pb-6">{#each [{ icon: FileText, value: room.fileCount, label: 'Documents' }, { icon: Link2, value: room.activeLinkCount, label: 'Active links' }, { icon: Users, value: room.viewersLast7Days, label: 'Investors, 7d' }] as stat (stat.label)}<div><p class="text-xl font-semibold tracking-tight tabular-nums">{stat.value}</p><p class="mt-1.5 text-[10px] text-muted-foreground">{stat.label}</p></div>{/each}</Card.Content>
				<Card.Footer class="flex items-center justify-between border-t bg-muted/25 px-6 py-3.5"><a href="/admin/rooms/{room.id}" class="flex items-center gap-2 text-xs font-medium">Open room<ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" /></a><a href="/admin/rooms/{room.id}/activity" class="text-[11px] text-muted-foreground hover:text-foreground">View analytics</a></Card.Footer>
			</Card.Root>
		{/each}
	</div>
{:else}
	<Card.Root class="shadow-none"><Card.Content><Empty.Root class="py-14"><Empty.Header><Empty.Media variant="icon"><FolderClosed /></Empty.Media><Empty.Title>{query ? 'No rooms match your search' : 'A better home for your documents'}</Empty.Title><Empty.Description>{query ? 'Try a different name or clear your search.' : 'Create your first data room, add your documents and invite investors with their own secure links.'}</Empty.Description></Empty.Header><Empty.Content>{#if query}<Button variant="outline" onclick={() => (query = '')}>Clear search</Button>{:else if canEdit}<Button onclick={() => (open = true)}><Plus data-icon="inline-start" />Create your first room</Button>{/if}</Empty.Content></Empty.Root></Card.Content></Card.Root>
{/if}

<Dialog.Root bind:open><Dialog.Content><Dialog.Header><Dialog.Title>Create a data room</Dialog.Title><Dialog.Description>Start with a name. You can add documents and choose who sees them next.</Dialog.Description></Dialog.Header><form class="flex flex-col gap-6" onsubmit={create}><Field.Group><Field.Field data-invalid={!!error}><Field.Label for="room-name">Room name</Field.Label><Input id="room-name" required maxlength={120} placeholder="Series A · Investor room" bind:value={name} aria-invalid={!!error} /><Field.Description>Choose a name your team and investors will recognize.</Field.Description>{#if error}<Field.Error>{error}</Field.Error>{/if}</Field.Field></Field.Group><Dialog.Footer><Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create room'}<ArrowRight data-icon="inline-end" /></Button></Dialog.Footer></form></Dialog.Content></Dialog.Root>
