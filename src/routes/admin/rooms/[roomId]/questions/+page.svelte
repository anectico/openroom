<script lang="ts">
	import { ArrowDown, ArrowUp, BookOpen, ChevronRight, FileText, MessageCircle, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import FaqEditor from '#lib/admin/FaqEditor.svelte';
	import { act } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	let unansweredOnly = $state(false);
	const unanswered = $derived(data.conversations.filter((c) => !c.answered));
	const conversations = $derived(unansweredOnly ? unanswered : data.conversations);
	let editorOpen = $state(false);
	let editing = $state<(typeof data.faq)[number] | null>(null);

	function openEditor(entry: (typeof data.faq)[number] | null) {
		editing = entry;
		editorOpen = true;
	}
</script>

<svelte:head><title>{room.name} · Questions · OpenRoom</title></svelte:head>

<header class="mb-4">
	<h2 class="text-xl font-semibold tracking-tight">Questions</h2>
</header>

<section class="mb-5 overflow-hidden rounded-xl border bg-card">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
		<div>
			<h3 class="flex items-center gap-2 text-base font-semibold"><MessageCircle class="size-4 text-primary" />Investor conversations</h3>
			<p class="mt-1 text-sm text-muted-foreground">Replies are private to the investor who asked.</p>
		</div>
		{#if data.conversations.length}
			<fieldset aria-label="Filter conversations" class="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
				{#each [{ label: 'All', count: data.conversations.length, only: false }, { label: 'Awaiting answer', count: unanswered.length, only: true }] as item (item.label)}
					<button type="button" aria-pressed={unansweredOnly === item.only} class="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm" onclick={() => (unansweredOnly = item.only)}>{item.label} <span class="ml-1 text-xs tabular-nums">{item.count}</span></button>
				{/each}
			</fieldset>
		{/if}
	</header>
	{#if conversations.length}
		<ul class="divide-y">
			{#each conversations as c (c.id)}
				<li>
					<a class="group flex items-center gap-3 px-4 py-4 hover:bg-muted/40 focus-visible:outline-offset-[-2px] sm:px-5" href="/admin/rooms/{room.id}/questions/{c.id}">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<span class="break-all text-sm font-semibold group-hover:underline">{c.email ?? 'Erased investor'}</span>
								{#if c.email && !c.verified}<Badge variant="outline">Unverified</Badge>{/if}
								<Badge variant={c.answered ? 'outline' : 'secondary'}>{c.answered ? 'Replied' : 'Awaiting answer'}</Badge>
							</div>
							<p class="mt-1 line-clamp-2 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{c.lastMessage}</p>
							<div class="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
								{#if c.fileTitle}<span class="min-w-0 [overflow-wrap:anywhere]"><FileText class="mr-1 inline size-3.5 align-text-bottom" />{c.fileTitle}{c.page ? `, page ${c.page}` : ''}</span>{/if}
								<span>{c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'}</span>
								<When at={c.lastMessageAt} timeZone={data.timeZone} />
							</div>
						</div>
						<ChevronRight aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="grid justify-items-center gap-2 px-5 py-9 text-center">
			<MessageCircle aria-hidden="true" class="mb-1 size-6 text-muted-foreground" />
			<p class="font-medium">{unansweredOnly ? 'No questions awaiting an answer' : 'No conversations yet'}</p>
			<p class="max-w-sm text-sm text-muted-foreground">{unansweredOnly ? 'Select All to see previous conversations.' : 'Investors can ask from a document or from My questions in the room.'}</p>
		</div>
	{/if}
</section>

<section class="overflow-hidden rounded-xl border bg-card">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
		<div>
			<h3 class="flex items-center gap-2 text-base font-semibold"><BookOpen class="size-4 text-primary" />Room FAQ</h3>
			<p class="mt-1 text-sm text-muted-foreground">Every investor in this room can read these answers.</p>
		</div>
		{#if canEdit}<Button variant="outline" onclick={() => openEditor(null)}><Plus />New entry</Button>{/if}
	</header>
	{#if data.faq.length === 0}
		<p class="px-5 py-6 text-sm text-muted-foreground">No FAQ entries yet.</p>
	{:else}
		<ul class="divide-y">
			{#each data.faq as f, i (f.id)}
				<li class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:px-5 sm:items-center sm:justify-between">
					<div class="min-w-0 flex-1 [overflow-wrap:anywhere]">
						<p class="font-medium">{f.question}</p>
						<p class="line-clamp-2 text-sm text-muted-foreground">{f.answerMarkdown}</p>
					</div>
					{#if canEdit}
						<div class="flex shrink-0 flex-wrap items-center gap-1 max-sm:[&_button]:min-h-11">
							<Button variant="ghost" size="icon-sm" class="max-sm:min-w-11" aria-label="Move up" title="Move up" disabled={i === 0}
								onclick={() => act('update_faq_entry', { faqId: f.id, position: i - 1 })}><ArrowUp aria-hidden="true" /></Button>
							<Button variant="ghost" size="icon-sm" class="max-sm:min-w-11" aria-label="Move down" title="Move down" disabled={i === data.faq.length - 1}
								onclick={() => act('update_faq_entry', { faqId: f.id, position: i + 1 })}><ArrowDown aria-hidden="true" /></Button>
							<Button variant="ghost" size="sm" onclick={() => openEditor(f)}><Pencil aria-hidden="true" />Edit</Button>
							<DangerAction
								operation="delete_faq_entry"
								input={{ faqId: f.id }}
								label="Delete"
								confirmLabel="Delete entry"
								title="Delete this FAQ entry?"
								success="Deleted"
							>
								{#snippet icon()}<Trash2 aria-hidden="true" />{/snippet}
							</DangerAction>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<FaqEditor bind:open={editorOpen} roomId={room.id} entry={editing} />
