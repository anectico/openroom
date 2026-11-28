<script lang="ts">
	import { ArrowLeft, Check, ChevronRight, Eye } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import FileIcon from '#lib/admin/FileIcon.svelte';
	import { act } from '#lib/admin/op.ts';
	import { openPreview } from '#lib/admin/preview.ts';
	import SectionHeading from '#lib/admin/SectionHeading.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	const g = $derived(data.group);
	type Node = (typeof g.tree)[number];
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	let name = $state(untrack(() => data.group.name));
	const collapsed = new SvelteSet<string>();
	let saving = $state<string | null>(null);
	let savedId = $state<string | null>(null);

	const byId = $derived(new Map(g.tree.map((node) => [node.id, node])));
	const hasChildren = $derived(new Set(g.tree.map((node) => node.parentId).filter(Boolean)));
	const shown = $derived(g.tree.filter((node) => {
		for (let parent = node.parentId; parent; parent = byId.get(parent)?.parentId ?? null) if (collapsed.has(parent)) return false;
		return true;
	}));

	function source(node: Node) {
		for (let parent = node.parentId ? byId.get(node.parentId) : undefined; parent; parent = parent.parentId ? byId.get(parent.parentId) : undefined)
			if (!parent.inherited) return `from “${parent.name}”`;
		return 'group default';
	}

	function choice(node: Node) {
		return node.inherited ? 'inherit' : node.access;
	}

	async function setAccess(node: Node, value: string) {
		if (value === choice(node)) return;
		saving = node.id;
		savedId = null;
		const r = await act('set_group_access', {
			groupId: g.id,
			...(node.type === 'folder' ? { folderId: node.id } : { fileId: node.id }),
			access: value,
		}, `Access to “${node.name}” saved`);
		saving = null;
		if (r) savedId = node.id;
	}

	function toggle(id: string) {
		if (collapsed.has(id)) collapsed.delete(id);
		else collapsed.add(id);
	}
</script>

<svelte:head><title>{g.name} · Groups · OpenRoom</title></svelte:head>

<a class="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:min-h-8" href="/admin/rooms/{room.id}/groups"><ArrowLeft aria-hidden="true" class="size-4" />All groups</a>
<SectionHeading title={g.name} description="Choose which folders and documents this group sees. A folder’s choice covers everything inside it, including documents added later.">
	{#snippet actions()}<Badge variant="outline">{g.linkCount} active link{g.linkCount === 1 ? '' : 's'}</Badge>{/snippet}
</SectionHeading>

<div class="mb-6 grid gap-5 rounded-xl border bg-card p-4 sm:p-5 md:grid-cols-2">
	<form
		class="space-y-2"
		onsubmit={(e) => {
			e.preventDefault();
			act('update_group', { groupId: g.id, name }, 'Group renamed');
		}}
	>
		<Label for="g-name">Group name</Label>
		<div class="flex gap-2">
			<Input id="g-name" required maxlength={120} bind:value={name} disabled={!canEdit} />
			{#if canEdit}<Button type="submit" variant="outline" disabled={name.trim() === g.name}>Save</Button>{/if}
		</div>
	</form>
	<div class="space-y-2">
		<Label for="g-default">Documents at the top of the room without their own choice</Label>
		<ChoiceSelect id="g-default" class="w-full" disabled={!canEdit} bind:value={() => g.defaultAccess, (defaultAccess) => act('update_group', { groupId: g.id, defaultAccess }, 'Group default saved')}
			options={[{ value: 'none', label: 'Hidden, including ones added later' }, { value: 'view', label: 'Visible, including ones added later' }]}
		/>
	</div>
	<div class="md:col-span-2">
		<p class="mb-2 text-sm font-medium">Sharing links in this group</p>
		{#if data.links.length}
			<ul class="space-y-2">{#each data.links as link (link.id)}<li class="flex flex-wrap items-center justify-between gap-2 text-sm"><span class="min-w-0 break-words">{link.label}</span>{#if canEdit && link.status === 'active'}<Button variant="outline" size="sm" onclick={() => openPreview(link.id)} aria-label="Preview group through {link.label}"><Eye data-icon="inline-start" />Preview group</Button>{/if}</li>{/each}</ul>
		{:else}
			<p class="text-sm text-muted-foreground">Choose this group in a sharing link to preview what its investors see.</p>
		{/if}
	</div>
</div>

{#if g.tree.length === 0}
	<div class="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">The room has no documents yet.</div>
{:else}
	<ul class="divide-y rounded-xl border bg-card" aria-label="Document access for {g.name}">
		{#each shown as node (node.id)}
			<li class="flex flex-col gap-2 py-2 pr-4 pl-[calc(0.5rem+var(--depth)*0.5rem)] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pl-[calc(0.5rem+var(--depth)*1rem)]" style="--depth: {Math.min(node.depth, 4)}">
				<span class="flex min-w-0 items-center gap-2">
					{#if node.type === 'folder' && hasChildren.has(node.id)}
						<Button variant="ghost" size="icon-sm" aria-expanded={!collapsed.has(node.id)} aria-label="{collapsed.has(node.id) ? 'Expand' : 'Collapse'} {node.name}" onclick={() => toggle(node.id)}><ChevronRight class="transition-transform {collapsed.has(node.id) ? '' : 'rotate-90'}" /></Button>
					{:else}
						<span class="w-11 shrink-0 sm:w-8" aria-hidden="true"></span>
					{/if}
					<FileIcon folder={node.type === 'folder'} small />
					<span class="min-w-0 truncate {node.type === 'folder' ? 'font-medium' : ''}">{node.name}</span>
					{#if node.access === 'view'}<Badge variant="secondary">Visible</Badge>{:else}<Badge variant="outline">Hidden</Badge>{/if}
					{#if saving === node.id}<span class="text-xs text-muted-foreground" role="status">Saving…</span>{:else if savedId === node.id}<span class="inline-flex items-center gap-1 text-xs text-primary" role="status"><Check aria-hidden="true" class="size-3.5" />Saved</span>{/if}
				</span>
				<ChoiceSelect label="Access to {node.name}" class="w-full sm:w-64" disabled={!canEdit || saving === node.id} bind:value={() => choice(node), (value) => setAccess(node, value)}
					options={[{ value: 'inherit', label: `Inherited: ${node.inherited ? (node.access === 'view' ? 'visible' : 'hidden') : 'follow above'} (${source(node)})` }, { value: 'view', label: 'Visible' }, { value: 'none', label: 'Hidden' }]}
				/>
			</li>
		{/each}
	</ul>
{/if}

{#if canEdit}
	<div class="mt-6 rounded-xl border bg-card p-4 sm:p-5">
		<p class="mb-3 text-sm text-muted-foreground">Deleting the group makes its links show the whole room.</p>
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
