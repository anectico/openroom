<script lang="ts">
	import { ChevronDown, Search, ShieldCheck, } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { attempt, formatDate } from '#lib/admin/op.ts';
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import When from '#lib/admin/When.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';

	let { data } = $props();
	const canEdit = $derived(data.member?.role !== 'observer');
	let entries = $state('');
	let unblock = $state('');
	let addError = $state('');
	let removeError = $state('');

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const list = entries.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
		if (!list.length) return;
		const r = await attempt<{ blocks: unknown[] }>('add_blocks', { entries: list });
		if (!r.ok) {
			addError = r.error;
			return;
		}
		addError = '';
		entries = '';
		toast.success(r.data.blocks.length ? `Blocked ${r.data.blocks.length}` : 'Already blocked; nothing changed');
	}

	async function removeTyped(event: SubmitEvent) {
		event.preventDefault();
		const r = await attempt('remove_block', { entry: unblock }, 'Block removed');
		if (r.ok) {
			unblock = '';
			removeError = '';
		} else removeError = r.error;
	}
</script>

<svelte:head><title>Investors · OpenRoom</title></svelte:head>

<PageHeading title="Investors" description="Activity and access across all your data rooms." eyebrow="Workspace" />

<form method="GET" class="mb-5 flex max-w-md gap-2">
	<div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input name="q" type="search" placeholder="Find an investor by email…" aria-label="Search by email" value={data.search} class="pl-9" /></div>
	<Button type="submit" variant="outline">Search</Button>
</form>
{#if data.viewers.length === 0}
	<div class="mb-8 rounded-lg border bg-background p-8 text-center text-muted-foreground">
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
						<Table.Cell class="py-4"><div class="flex min-w-0 items-center gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-medium text-primary">{v.email?.[0]?.toUpperCase() ?? 'V'}</span><div class="min-w-0"><a class="block truncate text-xs font-medium hover:text-primary" href="/admin/investors/{v.id}">{v.email}</a><p class="mt-1 truncate text-[10px] text-muted-foreground md:hidden">{v.firm ?? 'Independent investor'}</p><p class="mt-1 text-xs text-muted-foreground sm:hidden">Last seen <When at={v.lastSeenAt} timeZone={data.timeZone} /></p></div></div></Table.Cell>
						<Table.Cell class="hidden text-xs text-muted-foreground md:table-cell">{v.firm ?? ''}</Table.Cell>
						<Table.Cell class="hidden text-xs sm:table-cell">{v.rooms.join(', ')}</Table.Cell>
						<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"><When at={v.lastSeenAt} timeZone={data.timeZone} /></Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

<details class="group rounded-xl border bg-card"><summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4"><span class="flex items-center gap-2.5"><ShieldCheck class="size-4 text-muted-foreground" /><span class="text-xs font-medium">Workspace access controls</span><span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{data.blocks.length} blocked</span></span><ChevronDown class="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary><div class="border-t px-5 py-5"><h2 class="mb-2 text-sm font-medium">Blocked emails & domains</h2>
<p class="mb-4 text-sm text-muted-foreground">
	Emails and domains here can never enter any room, whatever a link’s allow list says.
</p>

{#if canEdit}
	<div class="mb-6 grid gap-4 md:grid-cols-2">
		<form class="flex flex-col gap-3 rounded-lg border bg-card p-4" onsubmit={add}>
			<Label for="block-add">Block</Label>
			<Textarea id="block-add" rows={3} placeholder={'restricted@example.com\nrestricted.example'} bind:value={entries} />
			{#if addError}<p class="text-sm text-destructive" role="alert">{addError}</p>{/if}
			<Button type="submit" size="sm">Block</Button>
		</form>
		<form class="flex flex-col gap-3 rounded-lg border bg-card p-4" onsubmit={removeTyped}>
			<Label for="block-remove">Unblock by typing the email or domain</Label>
			<Input id="block-remove" bind:value={unblock} />
			<p class="text-xs text-muted-foreground">Works for erased investors too.</p>
			{#if removeError}<p class="text-sm text-destructive" role="alert">{removeError}</p>{/if}
			<Button type="submit" size="sm" variant="outline">Unblock</Button>
		</form>
	</div>
{/if}

{#if data.blocks.length === 0}
	<div class="rounded-lg border bg-background p-8 text-center text-muted-foreground">Nobody is blocked.</div>
{:else}
	<div class="rounded-lg border bg-background">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Email or domain</Table.Head>
					<Table.Head>Added</Table.Head>
					{#if canEdit}<Table.Head class="w-24"><span class="sr-only">Actions</span></Table.Head>{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.blocks as b (b.id)}
					<Table.Row>
						<Table.Cell>{b.value}</Table.Cell>
						<Table.Cell class="text-sm text-muted-foreground">{formatDate(b.createdAt, data.timeZone)}</Table.Cell>
						{#if canEdit}
							<Table.Cell>
								<DangerAction
									operation="remove_block"
									input={{ blockId: b.id }}
									label="Unblock"
									title="Unblock {b.value}?"
									description="They can enter again through any link whose allow list includes them."
									success="Block removed"
								/>
							</Table.Cell>
						{/if}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

</div></details>
