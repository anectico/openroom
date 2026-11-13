<script lang="ts">
	import { toast } from 'svelte-sonner';
	import FaqEditor from '#lib/admin/FaqEditor.svelte';
	import { attempt } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';

	let { data } = $props();
	const t = $derived(data.thread);
	const canEdit = $derived(data.member?.role !== 'observer' && !data.room.frozenAt);
	let reply = $state('');
	let error = $state('');
	let faqOpen = $state(false);

	async function send(event: SubmitEvent) {
		event.preventDefault();
		const r = await attempt<{ emailed: boolean }>('reply_to_conversation', { conversationId: t.id, body: reply });
		if (!r.ok) {
			error = r.error;
			return;
		}
		reply = '';
		error = '';
		toast.success(r.data.emailed ? 'Answer sent and emailed to the investor' : 'Answer saved; the investor reads it in the room');
	}
</script>

<svelte:head><title>Question · {data.room.name} · OpenRoom</title></svelte:head>

<div class="mb-2 text-sm"><a class="text-muted-foreground hover:underline" href="/admin/rooms/{data.room.id}/questions">Questions</a></div>
<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
	<div>
		<p class="font-medium">
			{#if t.viewerId}<a class="hover:underline" href="/admin/investors/{t.viewerId}">{t.email ?? 'Erased investor'}</a>{#if t.email && !t.verified} <Badge variant="outline">Unverified</Badge>{/if}{:else}Erased investor{/if}
		</p>
		{#if t.fileTitle}
			<p class="text-sm text-muted-foreground">
				About <a class="underline" href="/admin/rooms/{data.room.id}/files/{t.fileId}" target="_blank" rel="noopener">{t.fileTitle}</a
				>{t.page ? `, page ${t.page}` : ''}
			</p>
		{/if}
	</div>
	{#if canEdit}<Button variant="outline" size="sm" onclick={() => (faqOpen = true)}>Make an FAQ entry</Button>{/if}
</div>

{#snippet thread()}
	<ul class="space-y-3">
		{#each t.messages as m (m.id)}
			<li class="rounded-lg border p-3 {m.from === 'member' ? 'bg-muted' : 'bg-background'}">
				<p class="mb-1 text-xs text-muted-foreground">
					{m.from === 'investor' ? (t.email ?? 'Investor') : (m.memberName ?? 'Member')} · <When at={m.createdAt} timeZone={data.timeZone} />
				</p>
				<p class="text-sm whitespace-pre-wrap">{m.body}</p>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="max-w-2xl">
	{@render thread()}
	{#if canEdit}
		<form class="mt-4 space-y-2" onsubmit={send}>
			<label class="text-sm font-medium" for="reply">Answer</label>
			<Textarea id="reply" rows={5} maxlength={5000} required bind:value={reply} />
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<Button type="submit">Send answer</Button>
			<p class="text-xs text-muted-foreground">A verified investor is emailed the answer when email is set up.</p>
		</form>
	{/if}
</div>

<FaqEditor bind:open={faqOpen} roomId={data.room.id} reference={thread} />
