<script lang="ts">
	import { Eye } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { act } from '#lib/admin/op.ts';
	import { openPreview } from '#lib/admin/preview.ts';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	const g = $derived(data.group);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	let name = $state(untrack(() => data.group.name));
	const selectClass = 'h-8 rounded-md border border-input bg-background px-2 text-sm';

	function choice(node: (typeof g.tree)[number]) {
		return node.inherited ? 'inherit' : node.access;
	}

	async function setAccess(node: (typeof g.tree)[number], select: HTMLSelectElement) {
		const value = select.value;
		const done = await act('set_group_access', {
			groupId: g.id,
			...(node.type === 'folder' ? { folderId: node.id } : { fileId: node.id }),
			access: value,
		});
		if (!done) select.value = choice(node);
	}
</script>

<svelte:head><title>{g.name} · Groups · OpenRoom</title></svelte:head>

<div class="mb-2 text-sm"><a class="text-muted-foreground hover:underline" href="/admin/rooms/{room.id}/groups">Groups</a></div>

<div class="mb-6 grid gap-4 rounded-lg border bg-background p-6 md:grid-cols-2">
	<form
		class="space-y-2"
		onsubmit={(e) => {
			e.preventDefault();
			act('update_group', { groupId: g.id, name }, 'Group renamed');
		}}
	>
		<Label for="g-name">Name</Label>
		<div class="flex gap-2">
			<Input id="g-name" required maxlength={120} bind:value={name} disabled={!canEdit} />
			{#if canEdit}<Button type="submit" variant="outline">Save</Button>{/if}
		</div>
	</form>
	<div class="space-y-2">
		<Label for="g-default">Top-level folders and files without their own choice</Label>
		<select
			id="g-default"
			class="{selectClass} h-9 w-full"
			value={g.defaultAccess}
			disabled={!canEdit}
			onchange={async (e) => {
				const select = e.currentTarget as HTMLSelectElement;
				if (!(await act('update_group', { groupId: g.id, defaultAccess: select.value }, 'Saved'))) select.value = g.defaultAccess;
			}}
		>
			<option value="none">Hidden, including ones added later</option>
			<option value="view">Visible, including ones added later</option>
		</select>
	</div>
	<div class="md:col-span-2">
		<p class="mb-2 text-sm text-muted-foreground">Links in this group</p>
		{#if data.links.length}
			<ul class="space-y-2">{#each data.links as link (link.id)}<li class="flex flex-wrap items-center justify-between gap-2 text-sm"><span class="min-w-0 break-words">{link.label}</span>{#if canEdit && link.status === 'active'}<Button variant="outline" size="sm" onclick={() => openPreview(link.id)} aria-label="Preview group through {link.label}"><Eye data-icon="inline-start" />Preview group</Button>{/if}</li>{/each}</ul>
		{:else}
			<p class="text-sm">Choose this group in a sharing link to preview its access and protection settings.</p>
		{/if}
	</div>
</div>

{#if g.tree.length === 0}
	<div class="rounded-lg border bg-background p-10 text-center text-muted-foreground">The room has no files yet.</div>
{:else}
	<ul class="divide-y rounded-lg border bg-background">
		{#each g.tree as node (node.id)}
			<li class="flex flex-col gap-2 py-2 pr-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3" style="padding-left: {1 + Math.min(node.depth, 4) * 0.75}rem">
				<span class="flex min-w-0 items-center gap-3">
					<span class="w-8 shrink-0 text-xs text-muted-foreground tabular-nums">{node.number}</span>
					<span class="min-w-0 truncate {node.type === 'folder' ? 'font-medium' : ''}">{node.name}</span>
					{#if node.access === 'view'}<Badge variant="secondary">Visible</Badge>{:else}<Badge variant="outline">Hidden</Badge>{/if}
				</span>
				<select
					aria-label="Access to {node.name}"
					class="{selectClass} w-full sm:w-auto"
					value={choice(node)}
					disabled={!canEdit}
					onchange={(e) => setAccess(node, e.currentTarget as HTMLSelectElement)}
				>
					<option value="inherit">Inherited ({node.inherited ? (node.access === 'view' ? 'visible' : 'hidden') : 'from above'})</option>
					<option value="view">Visible</option>
					<option value="none">Hidden</option>
				</select>
			</li>
		{/each}
	</ul>
{/if}

{#if canEdit}
	<div class="mt-6 rounded-lg border border-destructive/30 bg-background p-6">
		<p class="mb-3 text-sm text-muted-foreground">Deleting the group makes its links see the whole room.</p>
		<DangerAction
			operation="delete_group"
			input={{ groupId: g.id }}
			label="Delete group"
			title="Delete “{g.name}”?"
			success="Group deleted"
			onDone={() => goto(`/admin/rooms/${room.id}/groups`)}
		/>
	</div>
{/if}
