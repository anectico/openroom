<script lang="ts">
	import { MessageSquare, Plus } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let open = $state(false);
	let fileId = $state('room');
	let question = $state('');
	let busy = $state(false);
	let error = $state('');
	let sentId = $state('');
	$effect(() => {
		data.readingScope;
		untrack(() => { open = false; fileId = 'room'; question = error = sentId = ''; busy = false; });
	});
	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (sentId) { await goto(`/v/${data.linkId}/questions/${sentId}`); return; }
		const scope = data.readingScope;
		const linkId = data.linkId;
		busy = true;
		error = '';
		try {
			const response = await fetch(`/v/${linkId}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: question, fileId: fileId === 'room' ? null : fileId }) });
			const result = await response.json().catch(() => null);
			if (scope !== data.readingScope) return;
			if (!response.ok || !result?.id) throw new Error(result?.error ?? 'Your question could not be sent. Try again.');
			sentId = result.id;
			await goto(`/v/${data.linkId}/questions/${sentId}`);
		} catch (e) { if (scope !== data.readingScope) return; error = sentId ? 'Your question was sent. Open the conversation to continue.' : e instanceof TypeError ? 'Connection interrupted. Your draft is still here. Try again.' : e instanceof Error ? e.message : 'Your question could not be sent.'; }
		finally { if (scope === data.readingScope) busy = false; }
	}
</script>

<svelte:head><title>My questions · {data.roomName}</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 class="text-xl font-semibold">My questions</h1><p class="mt-1 text-sm text-muted-foreground">Private conversations with the team.</p></div>{#if !data.preview}<Button class="min-h-11" onclick={() => { open = true; error = ''; }}><Plus data-icon="inline-start" />Ask the team</Button>{/if}</div>
{#if !data.verified}<p class="mb-5 rounded-lg bg-muted p-4 text-sm">Your email was not verified. Replies are available in this session only and won’t be emailed.</p>{/if}
{#if data.threads.length === 0}
	<Empty.Root class="rounded-xl border bg-card py-10"><Empty.Header><Empty.Media variant="icon"><MessageSquare /></Empty.Media><Empty.Title>No questions yet</Empty.Title><Empty.Description>Ask about the room or choose a document. Only you and the team can see your conversation.</Empty.Description></Empty.Header></Empty.Root>
{:else}
	<ul class="divide-y rounded-xl border bg-card">
		{#each data.threads as thread (thread.id)}
			<li><a class="flex min-h-24 flex-col gap-3 p-4 hover:bg-muted/30 sm:p-5" href="/v/{data.linkId}/questions/{thread.id}"><div class="flex flex-wrap items-center justify-between gap-2">{#if thread.unread}<Badge>{thread.unread} unread</Badge>{/if}<Badge variant={thread.status === 'Replied' ? 'secondary' : 'outline'}>{thread.status}</Badge><span class="text-xs text-muted-foreground">{new Date(thread.at).toLocaleDateString()}</span></div><span class="line-clamp-3 break-words text-sm font-medium [overflow-wrap:anywhere]">{thread.first}</span><span class="break-words text-xs text-muted-foreground">{thread.fileTitle ?? 'About the room'}{thread.page ? ` · page ${thread.page}` : ''} · {thread.replies} {thread.replies === 1 ? 'reply' : 'replies'}</span></a></li>
		{/each}
	</ul>
{/if}

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto" showCloseButton={!busy} onInteractOutside={(event) => { if (busy) event.preventDefault(); }} onEscapeKeydown={(event) => { if (busy) event.preventDefault(); }}>
		<Dialog.Header><Dialog.Title>Ask the team</Dialog.Title><Dialog.Description>Send a private question about the room or a document.</Dialog.Description></Dialog.Header>
		<form class="flex flex-col gap-5" onsubmit={send}>
			<Field.Group>
				<Field.Field><Field.Label for="question-context">About</Field.Label><Select.Root type="single" bind:value={fileId} disabled={busy || !!sentId}><Select.Trigger id="question-context" class="min-h-11 w-full"><span class="truncate">{fileId === 'room' ? 'The room in general' : data.files.find((file) => file.id === fileId)?.name ?? 'Choose a document'}</span></Select.Trigger><Select.Content><Select.Group><Select.Item value="room">The room in general</Select.Item>{#each data.files as file (file.id)}<Select.Item value={file.id} label={file.name}>{file.name}</Select.Item>{/each}</Select.Group></Select.Content></Select.Root></Field.Field>
				<Field.Field><Field.Label for="team-question">Your question</Field.Label><Textarea id="team-question" class="field-sizing-fixed" rows={5} maxlength={5000} required bind:value={question} disabled={busy || !!sentId} placeholder="What would you like to know?" /></Field.Field>
			</Field.Group>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<Dialog.Footer><Button type="button" variant="outline" class="min-h-11" disabled={busy} onclick={() => (open = false)}>Cancel</Button><Button type="submit" class="min-h-11" disabled={busy || !question.trim()}>{busy ? 'Sending…' : sentId ? 'Open conversation' : 'Send question'}</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
