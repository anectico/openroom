<script lang="ts">
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import FaqEditor from '#lib/admin/FaqEditor.svelte';
	import { act } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	let editorOpen = $state(false);
	let editing = $state<(typeof data.faq)[number] | null>(null);

	function openEditor(entry: (typeof data.faq)[number] | null) {
		editing = entry;
		editorOpen = true;
	}
</script>

<svelte:head><title>{room.name} · Questions · OpenRoom</title></svelte:head>

<h2 class="mb-3 text-lg font-medium">Questions</h2>
{#if data.conversations.length === 0}
	<div class="mb-8 rounded-lg border bg-background p-8 text-center text-muted-foreground">
		No questions yet. Investors ask from any file in the viewer.
	</div>
{:else}
	<ul class="mb-8 divide-y rounded-lg border bg-background">
		{#each data.conversations as c (c.id)}
			<li class="flex flex-col items-start justify-between gap-3 px-4 py-4 sm:flex-row">
				<div class="min-w-0 w-full">
					<a class="font-medium break-all hover:underline" href="/admin/rooms/{room.id}/questions/{c.id}">{c.email ?? 'Erased investor'}</a>
					{#if c.email && !c.verified}<Badge variant="outline" class="ml-1">Unverified</Badge>{/if}
					{#if !c.answered}<Badge class="ml-1">Unanswered</Badge>{/if}
					<p class="truncate text-sm">{c.lastMessage}</p>
					{#if c.fileTitle}<p class="text-xs text-muted-foreground">{c.fileTitle}{c.page ? `, page ${c.page}` : ''}</p>{/if}
				</div>
				<span class="shrink-0 text-xs text-muted-foreground"><When at={c.lastMessageAt} timeZone={data.timeZone} /></span>
			</li>
		{/each}
	</ul>
{/if}

<div class="mb-3 flex items-center justify-between">
	<h2 class="text-lg font-medium">FAQ</h2>
	{#if canEdit}<Button size="sm" onclick={() => openEditor(null)}>New entry</Button>{/if}
</div>
{#if data.faq.length === 0}
	<p class="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
		No FAQ yet. Entries show to every investor in the room, below the files.
	</p>
{:else}
	<ul class="divide-y rounded-lg border bg-background">
		{#each data.faq as f, i (f.id)}
			<li class="flex flex-col items-start justify-between gap-3 px-4 py-4 sm:flex-row">
				<div class="min-w-0 w-full">
					<p class="font-medium">{f.question}</p>
					<p class="line-clamp-2 text-sm text-muted-foreground">{f.answerMarkdown}</p>
				</div>
				{#if canEdit}
					<div class="flex shrink-0 flex-wrap items-center gap-1">
						<Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0}
							onclick={() => act('update_faq_entry', { faqId: f.id, position: i - 1 })}>↑</Button
						>
						<Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === data.faq.length - 1}
							onclick={() => act('update_faq_entry', { faqId: f.id, position: i + 1 })}>↓</Button
						>
						<Button variant="ghost" size="sm" onclick={() => openEditor(f)}>Edit</Button>
						<DangerAction
							operation="delete_faq_entry"
							input={{ faqId: f.id }}
							label="Delete"
							confirmLabel="Delete entry"
							title="Delete this FAQ entry?"
							success="Deleted"
						/>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<FaqEditor bind:open={editorOpen} roomId={room.id} entry={editing} />
