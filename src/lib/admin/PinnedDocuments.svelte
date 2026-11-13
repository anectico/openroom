<script lang="ts">
	import { ArrowDown, ArrowUp, Pin, Plus, X } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { invalidateAll } from '$app/navigation';
	import { op } from './op.ts';
	import type { Room, TreeNode } from './types.ts';

	let { room, canEdit }: { room: Room; canEdit: boolean } = $props();
	let open = $state(false);
 let expanded = $state(false);
	let draft = $state<string[]>([]);
	let initial = $state<string[]>([]);
	let available = $state<TreeNode[]>([]);
	let query = $state('');
	let busy = $state(false);
	let refreshing = $state(false);
	let error = $state('');
	let status = $state('');
	const saved = $derived(room.pinnedFileIds.flatMap((id) => room.tree.find((node) => node.id === id) ?? []));
	const choices = $derived(available.filter((node) => !draft.includes(node.id) && node.name.toLowerCase().includes(query.trim().toLowerCase())));
	const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(initial));
	$effect(() => {
		if (!open) return;
		untrack(() => {
			draft = [...room.pinnedFileIds];
			initial = [...draft];
			available = room.tree.filter((node) => node.type === 'file');
			query = error = status = '';
		});
	});
	function move(index: number, by: number) {
		const next = [...draft];
		[next[index], next[index + by]] = [next[index + by], next[index]];
		draft = next;
	}
	async function refresh() {
		refreshing = true;
		error = '';
		try {
			const latest = await op<Room>('get_room', { roomId: room.id });
			available = latest.tree.filter((node) => node.type === 'file');
			const count = draft.length;
			draft = draft.filter((id) => available.some((node) => node.id === id));
			status = count !== draft.length ? 'Documents that are no longer available were removed from your draft. Save to apply the list.' : 'Document list refreshed. Your draft is unchanged.';
		} catch { error = 'Could not refresh documents. Your draft is still here.'; }
		finally { refreshing = false; }
	}
	async function save() {
		if (busy || refreshing || !canEdit) return;
		busy = true;
		error = '';
		try {
			const result = await op<{ fileIds: string[] }>('set_pinned_documents', { roomId: room.id, fileIds: draft });
			if (!result?.fileIds) throw new Error('Your session may have ended. Sign in and try again.');
			initial = [...result.fileIds];
			await invalidateAll().catch(() => toast.warning('Pinned documents saved. Reload to refresh the document list.'));
			open = false;
		} catch (e) { error = e instanceof Error ? e.message : 'Could not save. Your draft is still here.'; }
		finally { busy = false; }
	}
</script>

{#if saved.length || canEdit}
	<section class="mb-5 rounded-xl border bg-card p-4 sm:p-5" aria-label="Start here documents">
		<div class="flex flex-wrap items-start justify-between gap-3"><div class="flex min-w-0 items-start gap-3"><Pin class="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><h2 class="text-sm font-semibold">Start here <span class="font-normal text-muted-foreground">· {saved.length} pinned</span></h2><p class="mt-1 hidden text-xs leading-relaxed sm:block text-muted-foreground">{saved.length ? 'Suggested reading order. Each investor sees only documents they can access.' : 'Give investors a starting point with up to six pinned documents.'}</p></div></div>{#if canEdit}<Button variant="outline" class="min-h-11" size="sm" onclick={() => (open = true)}>{saved.length ? 'Manage pinned documents' : 'Choose documents'}</Button>{/if}</div>
		{#if saved.length}<button type="button" class="mt-2 flex min-h-11 items-center text-sm underline underline-offset-4 sm:hidden" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>{expanded ? 'Hide reading order' : 'Show reading order'}</button><ol class={expanded ? "mt-3 flex flex-wrap gap-2" : "mt-4 hidden flex-wrap gap-2 sm:flex"}>{#each saved as file, index (file.id)}<li class="flex min-w-0 max-w-full items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs"><span class="font-semibold text-muted-foreground">{index + 1}</span><span class="break-words [overflow-wrap:anywhere]">{file.name}</span></li>{/each}</ol>{/if}
	</section>
{/if}

<Dialog.Root bind:open>
	<Dialog.Content class="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={!busy} onInteractOutside={(event) => { if (busy) event.preventDefault(); }} onEscapeKeydown={(event) => { if (busy) event.preventDefault(); }}>
		<Dialog.Header class="border-b px-5 py-5"><Dialog.Title>Choose where investors start</Dialog.Title><Dialog.Description>Pin up to six documents and set their reading order. This never changes who can access a document.</Dialog.Description></Dialog.Header>
		<div class="flex min-h-0 flex-col gap-5 overflow-y-auto p-5">
			<div><div class="mb-3 flex items-center justify-between gap-2"><h3 class="text-sm font-medium">Reading order</h3><span class="text-xs text-muted-foreground" role="status">{draft.length} of 6 selected</span></div>
				{#if draft.length}<ol class="flex flex-col gap-2">{#each draft as id, index (id)}{@const file = available.find((node) => node.id === id)}<li class="flex flex-wrap items-center gap-2 rounded-lg border p-2"><span class="w-5 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span><span class="min-w-0 flex-1 break-words text-sm [overflow-wrap:anywhere]">{file?.name ?? 'Document no longer available'}</span><div class="flex shrink-0 items-center"><Button variant="ghost" size="icon" class="size-11" aria-label="Move {file?.name ?? 'document'} up" disabled={busy || refreshing || index === 0} onclick={() => move(index, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon" class="size-11" aria-label="Move {file?.name ?? 'document'} down" disabled={busy || refreshing || index === draft.length - 1} onclick={() => move(index, 1)}><ArrowDown /></Button><Button variant="ghost" size="icon" class="size-11" aria-label="Unpin {file?.name ?? 'document'}" disabled={busy || refreshing} onclick={() => (draft = draft.filter((value) => value !== id))}><X /></Button></div></li>{/each}</ol>{:else}<p class="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">Choose documents below. Without pins, investors go straight to the full document list.</p>{/if}
			</div>
			<Field.Field><Field.Label for="pin-search">Find a document to pin</Field.Label><Input id="pin-search" type="search" class="min-h-11" bind:value={query} placeholder="Search all document titles…" /></Field.Field>
			<ul class="divide-y rounded-lg border">{#each choices.slice(0, 50) as file (file.id)}<li class="flex min-w-0 items-center gap-3 px-3 py-2"><span class="min-w-0 flex-1"><span class="block break-words text-sm [overflow-wrap:anywhere]">{file.name}</span><span class="mt-1 block text-xs text-muted-foreground">{file.number} · {file.kind === 'download' ? 'Download' : file.kind?.toUpperCase()}</span></span><Button variant="ghost" size="icon" class="size-11 shrink-0" aria-label="Pin {file.name}" disabled={busy || refreshing || draft.length >= 6} onclick={() => (draft = [...draft, file.id])}><Plus /></Button></li>{:else}<li class="p-4 text-sm text-muted-foreground">{available.length ? 'No more matching documents. Try another title.' : 'Upload documents to this room first.'}</li>{/each}</ul>
			{#if choices.length > 50}<p class="text-xs text-muted-foreground">Showing the first 50 matches. Refine your search to find another document.</p>{/if}
			<div class="flex flex-wrap items-center gap-3"><Button variant="ghost" size="sm" class="min-h-11" disabled={busy || refreshing} onclick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh documents'}</Button><Button variant="ghost" size="sm" class="min-h-11" disabled={busy || refreshing || !draft.length} onclick={() => (draft = [])}>Clear pinned list</Button></div>
			{#if status}<p class="text-xs text-muted-foreground" role="status">{status}</p>{/if}
		</div>
		<div class="border-t p-5">{#if error}<p class="mb-3 text-sm text-destructive" role="alert">{error}</p>{/if}<Dialog.Footer><Button variant="outline" class="min-h-11" disabled={busy} onclick={() => (open = false)}>Cancel</Button><Button class="min-h-11" disabled={busy || refreshing || !dirty} onclick={save}>{busy ? 'Saving…' : 'Save Start here'}</Button></Dialog.Footer></div>
	</Dialog.Content>
</Dialog.Root>
