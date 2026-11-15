<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { attempt } from './op.ts';

	let {
		open = $bindable(false),
		roomId,
		entry = null,
		reference,
	}: {
		open?: boolean;
		roomId: string;
		entry?: { id: string; question: string; answerMarkdown: string } | null;
		reference?: Snippet;
	} = $props();

	let question = $state('');
	let answer = $state('');
	let error = $state('');
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		question = entry?.question ?? '';
		answer = entry?.answerMarkdown ?? '';
		error = '';
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		saving = true;
		const r = entry
			? await attempt('update_faq_entry', { faqId: entry.id, question, answerMarkdown: answer }, 'FAQ entry saved')
			: await attempt('create_faq_entry', { roomId, question, answerMarkdown: answer }, 'FAQ entry added');
		saving = false;
		if (r.ok) open = false;
		else error = r.error;
	}
</script>

<Dialog.Root bind:open={() => open, (value) => { if (!saving) open = value; }}>
	<Dialog.Content class={["flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", reference ? "sm:max-w-3xl" : "sm:max-w-lg"]}>
		<Dialog.Header class="shrink-0 border-b px-5 py-4 pr-14">
			<Dialog.Title>{entry ? 'Edit FAQ entry' : 'New FAQ entry'}</Dialog.Title>
			<Dialog.Description>Every investor in the room sees it. Write it in your own words.</Dialog.Description>
		</Dialog.Header>
		<form onsubmit={save} class="flex min-h-0 flex-col">
			<fieldset disabled={saving} class="grid min-w-0 gap-4 overflow-y-auto p-5 {reference ? 'md:grid-cols-2' : ''}">
				{#if reference}
					<div class="max-h-96 overflow-y-auto rounded-md border bg-muted/50 p-3 text-sm">{@render reference()}</div>
				{/if}
				<div class="min-w-0 space-y-3">
					<div class="space-y-1">
						<Label for="faq-q">Question</Label>
						<Input id="faq-q" required minlength={3} maxlength={500} bind:value={question} />
					</div>
					<div class="space-y-1">
						<Label for="faq-a">Answer</Label>
						<Textarea id="faq-a" rows={5} required bind:value={answer} />
						<p class="text-xs text-muted-foreground">Supports Markdown for bold text, lists and links.</p>
					</div>
					{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
				</div>
			</fieldset>
			<Dialog.Footer class="shrink-0 flex-row justify-end border-t px-5 py-3">
				<Button variant="outline" disabled={saving} onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={saving}>{saving ? 'Saving…' : entry ? 'Save' : 'Add to FAQ'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
