<script lang="ts">
	import { ArrowLeft, BookOpen, FileText, Send } from '@lucide/svelte';
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
	let sending = $state(false);
	let faqOpen = $state(false);

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (sending || !reply.trim()) return;
		sending = true;
		const r = await attempt<{ emailed: boolean }>('reply_to_conversation', { conversationId: t.id, body: reply });
		sending = false;
		if (!r.ok) {
			error = r.error;
			return;
		}
		reply = '';
		error = '';
		toast.success(r.data.emailed ? 'Answer sent and emailed to the investor' : 'Answer saved. The investor can read it in the room.');
	}
</script>

<svelte:head><title>Question · {data.room.name} · OpenRoom</title></svelte:head>

{#snippet thread()}
	<ul class="space-y-4">
		{#each t.messages as m (m.id)}
			<li class="rounded-lg border p-3 {m.from === 'member' ? 'ml-4 border-primary/15 bg-primary/5 sm:ml-10' : 'mr-4 bg-background sm:mr-10'}">
				<p class="mb-1.5 break-all text-xs text-muted-foreground">
					{m.from === 'investor' ? (t.email ?? 'Investor') : (m.memberName ?? 'Member')} · <When at={m.createdAt} timeZone={data.timeZone} />
				</p>
				<p class="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
			</li>
		{/each}
	</ul>
{/snippet}

<a class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline" href="/admin/rooms/{data.room.id}/questions"><ArrowLeft class="size-4" />All questions</a>
<section class="max-w-4xl overflow-hidden rounded-xl border bg-card">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
		<div class="min-w-0">
			<h2 class="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
				{#if t.viewerId}<a class="break-all hover:underline" href="/admin/investors/{t.viewerId}">{t.email ?? 'Erased investor'}</a>{:else}Erased investor{/if}
				{#if t.email && !t.verified}<Badge variant="outline">Unverified</Badge>{/if}
			</h2>
			{#if t.fileTitle}
				<a class="mt-1 inline-flex items-baseline gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline" href="/admin/rooms/{data.room.id}/files/{t.fileId}" target="_blank" rel="noopener"><FileText class="size-3.5 shrink-0 self-center" /><span class="[overflow-wrap:anywhere]">{t.fileTitle}{t.page ? `, page ${t.page}` : ''}</span></a>
			{/if}
		</div>
		{#if canEdit}<Button variant="outline" onclick={() => (faqOpen = true)}><BookOpen />Make an FAQ entry</Button>{/if}
	</header>

	<div class="p-4 sm:p-5">{@render thread()}</div>
	{#if canEdit}
		<form class="grid gap-2 border-t bg-muted/20 p-4 sm:p-5" onsubmit={send}>
			<label class="text-sm font-medium" for="reply">Answer</label>
			<Textarea id="reply" rows={3} disabled={sending} maxlength={5000} required bind:value={reply} />
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<div class="mt-1 flex flex-wrap items-center justify-between gap-3">
				<p class="text-xs text-muted-foreground">A verified investor is emailed the answer when email is set up.</p>
				<Button type="submit" disabled={sending || !reply.trim()}><Send />{sending ? 'Sending…' : 'Send answer'}</Button>
			</div>
		</form>
	{/if}
</section>

<FaqEditor bind:open={faqOpen} roomId={data.room.id} reference={thread} />
