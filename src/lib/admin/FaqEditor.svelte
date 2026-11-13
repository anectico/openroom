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

	$effect(() => {
		if (!open) return;
		question = entry?.question ?? '';
		answer = entry?.answerMarkdown ?? '';
		error = '';
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const r = entry
			? await attempt('update_faq_entry', { faqId: entry.id, question, answerMarkdown: answer }, 'FAQ entry saved')
			: await attempt('create_faq_entry', { roomId, question, answerMarkdown: answer }, 'FAQ entry added');
		if (r.ok) open = false;
		else error = r.error;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>{entry ? 'Edit FAQ entry' : 'New FAQ entry'}</Dialog.Title>
			<Dialog.Description>Every investor in the room sees it. Write it in your own words.</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 {reference ? 'md:grid-cols-2' : ''}">
			{#if reference}
				<div class="max-h-96 overflow-y-auto rounded-md border bg-muted/50 p-3 text-sm">{@render reference()}</div>
			{/if}
			<form class="space-y-3" onsubmit={save}>
				<div class="space-y-1">
					<Label for="faq-q">Question</Label>
					<Input id="faq-q" required minlength={3} maxlength={500} bind:value={question} />
				</div>
				<div class="space-y-1">
					<Label for="faq-a">Answer</Label>
					<Textarea id="faq-a" rows={8} required bind:value={answer} />
					<p class="text-xs text-muted-foreground">Markdown: **bold**, lists and links.</p>
				</div>
				{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
				<Button type="submit">{entry ? 'Save' : 'Add to FAQ'}</Button>
			</form>
		</div>
	</Dialog.Content>
</Dialog.Root>
