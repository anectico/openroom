<script lang="ts">
	import { attempt } from '#lib/admin/op.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	let open = $state(false);
	let name = $state('');
	let defaultAccess = $state<'view' | 'none'>('none');
	let error = $state('');

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const r = await attempt<{ id: string }>('create_group', { roomId: room.id, name, defaultAccess }, 'Group created');
		if (!r.ok) {
			error = r.error;
			return;
		}
		open = false;
		name = '';
		error = '';
		await goto(`/admin/rooms/${room.id}/groups/${r.data.id}`);
	}
</script>

<svelte:head><title>{room.name} · Groups · OpenRoom</title></svelte:head>

<div class="mb-4 flex items-center justify-between gap-4">
	<p class="text-sm text-muted-foreground">
		A group decides which folders and files its links see. A link without a group sees the whole room.
	</p>
	{#if !room.frozenAt}<Button onclick={() => (open = true)}>New group</Button>{/if}
</div>

{#if data.groups.length === 0}
	<div class="rounded-lg border bg-background p-10 text-center text-muted-foreground">
		No groups yet. Make one per fund or audience to show them only part of the room.
	</div>
{:else}
	<div class="rounded-lg border bg-background">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Group</Table.Head>
					<Table.Head>New top-level items</Table.Head>
					<Table.Head class="text-right">Links</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.groups as g (g.id)}
					<Table.Row>
						<Table.Cell><a class="font-medium hover:underline" href="/admin/rooms/{room.id}/groups/{g.id}">{g.name}</a></Table.Cell>
						<Table.Cell class="text-sm text-muted-foreground">{g.defaultAccess === 'view' ? 'Visible' : 'Hidden'}</Table.Cell>
						<Table.Cell class="text-right">{g.linkCount}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

<Dialog.Root bind:open onOpenChange={() => (error = '')}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>New group</Dialog.Title></Dialog.Header>
		<form class="space-y-4" onsubmit={create}>
			<div class="space-y-2">
				<Label for="group-name">Name</Label>
				<Input id="group-name" required maxlength={120} placeholder="Fund X partners" bind:value={name} />
			</div>
			<div class="space-y-2">
				<Label for="group-default">Top-level folders and files</Label>
				<select
					id="group-default"
					class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
					bind:value={defaultAccess}
				>
					<option value="none">Hidden until I choose to show them</option>
					<option value="view">Visible unless I hide them</option>
				</select>
			</div>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<Dialog.Footer><Button type="submit">Create group</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
