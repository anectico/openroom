<script lang="ts">
	import { Search, ShieldCheck } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { act, attempt, formatDate } from '#lib/admin/op.ts';
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import When from '#lib/admin/When.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	const canEdit = $derived(data.member?.role !== 'observer');
	let search = $state(page.url.searchParams.get('q') ?? '');
	let entry = $state('');
	let addError = $state('');
	let blocking = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function filter(value: string) {
		search = value;
		clearTimeout(timer);
		timer = setTimeout(() => {
			const next = new URL(page.url.href);
			if (value.trim()) next.searchParams.set('q', value.trim());
			else next.searchParams.delete('q');
			if (next.search !== page.url.search) void goto(next, { replace: true, reset: false });
		}, 250);
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const list = entry.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
		if (!list.length || blocking) return;
		blocking = true;
		const r = await attempt<{ blocks: unknown[] }>('add_blocks', { entries: list });
		blocking = false;
		if (!r.ok) {
			addError = r.error;
			return;
		}
		addError = '';
		entry = '';
		toast.success(r.data.blocks.length ? `Blocked ${r.data.blocks.length}` : 'Already blocked; nothing changed');
	}
</script>

<svelte:head><title>Investors · OpenRoom</title></svelte:head>

<PageHeading title="Investors" description="Activity and access across all your data rooms." eyebrow="Workspace" />

<search class="mb-5 block max-w-md"><form method="GET" onsubmit={(e) => { e.preventDefault(); filter(search); }}>
	<div class="relative"><Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input name="q" type="search" placeholder="Filter by email…" aria-label="Filter investors by email" value={search} oninput={(e) => filter(e.currentTarget.value)} class="pl-9" /></div>
</form></search>
{#if data.viewers.length === 0}
	<div class="mb-8 rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
		{data.search ? 'No investor matches.' : 'No investor has opened a room yet.'}
	</div>
{:else}
	<div class="mb-8 overflow-hidden rounded-xl border bg-card">
		<Table.Root class="table-fixed sm:table-auto">
			<Table.Header>
				<Table.Row>
					<Table.Head>Email</Table.Head>
					<Table.Head class="hidden md:table-cell">Firm</Table.Head>
					<Table.Head class="hidden sm:table-cell">Rooms</Table.Head>
					<Table.Head class="hidden sm:table-cell">Last seen</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.viewers as v (v.id)}
					<Table.Row>
						<Table.Cell class="py-4"><div class="flex min-w-0 items-center gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-medium text-primary">{v.email?.[0]?.toUpperCase() ?? 'V'}</span><div class="min-w-0"><a class="block truncate text-xs font-medium hover:text-primary" href="/admin/investors/{v.id}">{v.email}</a>{#if v.firm}<p class="mt-1 truncate text-xs text-muted-foreground md:hidden">{v.firm}</p>{/if}<p class="mt-1 text-xs text-muted-foreground sm:hidden">Last seen <When at={v.lastSeenAt} timeZone={data.timeZone} /></p></div></div></Table.Cell>
						<Table.Cell class="hidden text-xs text-muted-foreground md:table-cell">{v.firm ?? ''}</Table.Cell>
						<Table.Cell class="hidden text-xs sm:table-cell">{v.rooms.join(', ')}</Table.Cell>
						<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"><When at={v.lastSeenAt} timeZone={data.timeZone} /></Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

<section class="rounded-xl border bg-card" aria-labelledby="blocks-title">
	<div class="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
		<div class="min-w-0"><h2 id="blocks-title" class="flex items-center gap-2 text-sm font-semibold"><ShieldCheck class="size-4 text-muted-foreground" aria-hidden="true" />Blocked emails & domains</h2><p class="mt-1 text-xs leading-relaxed text-muted-foreground">They can never enter any room, whatever a link’s allow list says. A domain also blocks its subdomains. Open sessions end at once.</p></div>
		<span class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{data.blocks.length} blocked</span>
	</div>
	{#if canEdit}
		<form class="border-b px-5 py-4" onsubmit={add}>
			<Field.Field data-invalid={!!addError}>
				<Field.Label for="block-add">Email or domain</Field.Label>
				<div class="flex max-w-lg gap-2"><Input id="block-add" placeholder="name@fund.com or fund.com" bind:value={entry} aria-invalid={!!addError} /><Button type="submit" variant="outline" disabled={blocking || !entry.trim()}>Block</Button></div>
				<Field.Description>Separate several with commas. An erased investor shows as “Erased investor”; unblock them from their row below.</Field.Description>
				{#if addError}<Field.Error>{addError}</Field.Error>{/if}
			</Field.Field>
		</form>
	{/if}
	{#if data.blocks.length === 0}
		<p class="px-5 py-6 text-center text-sm text-muted-foreground">Nobody is blocked.</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="pl-5">Email or domain</Table.Head>
					<Table.Head class="hidden sm:table-cell">Added</Table.Head>
					{#if canEdit}<Table.Head class="w-28 pr-5"><span class="sr-only">Actions</span></Table.Head>{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.blocks as b (b.id)}
					<Table.Row>
						<Table.Cell class="max-w-0 pl-5 whitespace-normal break-all sm:max-w-none">{b.value}<p class="mt-1 text-xs text-muted-foreground sm:hidden">{formatDate(b.createdAt, data.timeZone)}</p></Table.Cell>
						<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell">{formatDate(b.createdAt, data.timeZone)}</Table.Cell>
						{#if canEdit}<Table.Cell class="pr-5 text-right"><Button variant="outline" size="sm" onclick={() => act('remove_block', { blockId: b.id }, `Unblocked ${b.value}`)}>Unblock</Button></Table.Cell>{/if}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</section>
