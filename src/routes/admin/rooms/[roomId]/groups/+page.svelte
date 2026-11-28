<script lang="ts">
	import { Plus, Users } from '@lucide/svelte';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import { attempt } from '#lib/admin/op.ts';
	import SectionHeading from '#lib/admin/SectionHeading.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(!room.frozenAt && data.member?.role !== 'observer');
	let open = $state(false);
	let name = $state('');
	let defaultAccess = $state<'view' | 'none'>('none');
	let error = $state('');
	let creating = $state(false);
	const startLabel = { none: 'Sees nothing until you show it', view: 'Sees everything until you hide it' };

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		creating = true;
		const r = await attempt<{ id: string }>('create_group', { roomId: room.id, name, defaultAccess }, 'Group created');
		creating = false;
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

<SectionHeading title="Groups" description="A group decides which folders and documents its sharing links show. A link without a group shows the whole room.">
	{#snippet actions()}{#if canEdit}<Button onclick={() => (open = true)}><Plus data-icon="inline-start" />New group</Button>{/if}{/snippet}
</SectionHeading>

{#if data.groups.length === 0}
	<Empty.Root class="rounded-xl border bg-card py-12"><Empty.Header><Empty.Media variant="icon"><Users /></Empty.Media><Empty.Title>No groups yet</Empty.Title><Empty.Description>Make one per fund or audience to show them only part of the room.</Empty.Description></Empty.Header>{#if canEdit}<Empty.Content><Button onclick={() => (open = true)}><Plus data-icon="inline-start" />New group</Button></Empty.Content>{/if}</Empty.Root>
{:else}
	<div class="overflow-hidden rounded-xl border bg-card">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="pl-5">Group</Table.Head>
					<Table.Head class="hidden sm:table-cell">Documents without their own choice</Table.Head>
					<Table.Head class="pr-5 text-right">Active links</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.groups as g (g.id)}
					<Table.Row>
						<Table.Cell class="py-3 pl-5 whitespace-normal">
							<a class="flex min-h-11 flex-col justify-center font-medium hover:text-primary hover:underline" href="/admin/rooms/{room.id}/groups/{g.id}">{g.name}</a>
							<span class="block text-xs text-muted-foreground sm:hidden">{startLabel[g.defaultAccess]}</span>
						</Table.Cell>
						<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell">{startLabel[g.defaultAccess]}</Table.Cell>
						<Table.Cell class="pr-5 text-right tabular-nums">{g.linkCount}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

<Dialog.Root bind:open onOpenChange={() => (error = '')}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>New group</Dialog.Title><Dialog.Description>Name the audience, then choose which documents it sees. Use the group in a sharing link to apply it.</Dialog.Description></Dialog.Header>
		<form class="flex flex-col gap-6" onsubmit={create}>
			<Field.Group>
				<Field.Field data-invalid={!!error}>
					<Field.Label for="group-name">Group name</Field.Label>
					<Input id="group-name" required maxlength={120} placeholder="Fund X partners" bind:value={name} aria-invalid={!!error} />
					<Field.Description>Only your team sees this name.</Field.Description>
				</Field.Field>
				<Field.Field>
					<Field.Label for="group-default">To start, this group</Field.Label>
					<ChoiceSelect id="group-default" class="w-full" bind:value={defaultAccess}
						options={[{ value: 'none', label: 'Sees nothing until I show documents' }, { value: 'view', label: 'Sees everything until I hide documents' }]}
					/>
					<Field.Description>This also applies to documents added to the top of the room later.</Field.Description>
					{#if error}<Field.Error>{error}</Field.Error>{/if}
				</Field.Field>
			</Field.Group>
			<Dialog.Footer><Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button><Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create group'}</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
