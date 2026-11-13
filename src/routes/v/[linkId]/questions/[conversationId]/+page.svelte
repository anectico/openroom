<script lang="ts">
	import { untrack } from 'svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import LocalTime from '#lib/viewer/LocalTime.svelte';

	import ReplyComposer from '#lib/viewer/ReplyComposer.svelte';

	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let hasDraft = $state(false);
 let unreadBoundary = $state<string | null>(null);
 const threadScope = $derived(`${data.readingScope}:${data.thread.id}`);
 const firstUnread = $derived(data.messages.find((message) => message.unread)?.id ?? null);
 $effect(() => { void threadScope; untrack(() => { unreadBoundary = data.messages.find((message) => message.unread)?.id ?? null; hasDraft = false; }); });
 $effect(() => { if (firstUnread && !unreadBoundary) unreadBoundary = firstUnread; });
 function jumpTo(id: string, reply = false) {
  const target = document.getElementById(id);
  target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  if (reply) target?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
  else target?.focus({ preventScroll: true });
 }
 let messagesElement = $state<HTMLUListElement>();
	$effect(() => {
		const root = messagesElement;
		const unread = new Set(data.messages.filter((m) => m.unread).map((m) => m.id));
		const linkId = data.linkId;
		const conversationId = data.thread.id;
		if (!root || !unread.size || data.preview) return;
		const visible = new Set<string>();
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		let busy = false;
		async function mark() {
			if (busy || document.visibilityState !== 'visible' || !visible.size) return;
			busy = true;
			const ids = [...visible].filter((id) => unread.has(id)).slice(0, 200);
			try {
				const response = await fetch(`/v/${linkId}/questions/${conversationId}/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messageIds: ids }), signal: controller.signal });
				if (response.ok) { for (const id of ids) unread.delete(id); await invalidateAll(); }
			} catch {} finally { busy = false; }
		}
		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) { const id = (entry.target as HTMLElement).dataset.messageId; if (id) { if (entry.isIntersecting && entry.intersectionRatio > 0) visible.add(id); else visible.delete(id); } }
			clearTimeout(timer);
			timer = setTimeout(mark, 400);
		}, { threshold: 0 });
		for (const node of root.querySelectorAll<HTMLElement>('[data-message-id]')) if (unread.has(node.dataset.messageId ?? '')) observer.observe(node);
		document.addEventListener('visibilitychange', mark);
		window.addEventListener('online', mark);
		return () => { observer.disconnect(); clearTimeout(timer); controller.abort(); document.removeEventListener('visibilitychange', mark); window.removeEventListener('online', mark); };
	});
</script>

<svelte:head><title>Question · {data.roomName}</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<a class="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline" href="/v/{data.linkId}/questions">My questions</a>
	<h1 class="mt-2 text-xl font-semibold">Conversation with the team</h1>
	{#if data.thread.fileTitle}
		<p class="mt-1 text-sm [overflow-wrap:anywhere]">
			About <a class="underline" href="/v/{data.linkId}/view/{data.thread.fileId}{data.thread.page ? `?page=${data.thread.page}` : ''}">{data.thread.fileTitle}</a>{data.thread.page
				? `, page ${data.thread.page}`
				: ''}
		</p><p class="mt-1 text-xs text-muted-foreground">Opens the current document version.</p>
	{/if}
	<nav class="sticky top-0 z-10 mt-4 flex flex-wrap gap-1 rounded-xl border bg-card/95 p-1 shadow-sm backdrop-blur" aria-label="Conversation shortcuts">{#if firstUnread || unreadBoundary}<Button variant="ghost" size="sm" class="min-h-11" aria-label={firstUnread ? 'Jump to unread' : 'New replies'} onclick={() => jumpTo(`message-${firstUnread ?? unreadBoundary}`)}><span class="hidden min-[360px]:inline">{firstUnread ? 'Jump to unread' : 'New replies'}</span><span class="min-[360px]:hidden">{firstUnread ? 'Unread' : 'New'}</span></Button>{/if}{#if data.messages.length}<Button variant="ghost" size="sm" class="min-h-11" aria-label="Latest reply" onclick={() => jumpTo(`message-${data.messages[data.messages.length - 1].id}`)}><span class="hidden min-[360px]:inline">Latest reply</span><span class="min-[360px]:hidden">Latest</span></Button>{/if}{#if !data.preview}<Button variant="ghost" size="sm" class="min-h-11" aria-label={hasDraft ? 'Resume draft' : 'Reply'} onclick={() => jumpTo('conversation-reply', true)}><span class="hidden min-[360px]:inline">{hasDraft ? 'Resume draft' : 'Reply'}</span><span class="min-[360px]:hidden">{hasDraft ? 'Draft' : 'Reply'}</span></Button>{/if}</nav>
 <ul bind:this={messagesElement} class="my-4 flex flex-col gap-3">
		{#each data.messages as m (m.id)}
            <li id="message-{m.id}" tabindex="-1" class="scroll-mt-28 min-w-0">
                {#if m.id === unreadBoundary}<p class="border-t py-3 text-center text-xs font-semibold text-primary">New replies</p>{/if}
                <article data-message-id={m.id} class="rounded-xl border p-4 {m.mine ? 'bg-card' : 'bg-muted/50'}">
                    <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1"><span class="text-sm font-semibold [overflow-wrap:anywhere]">{m.name}</span>{#if m.unread}<Badge variant="attention">Unread reply</Badge>{/if}<span class="text-xs text-muted-foreground"><LocalTime at={m.at} /></span></div>
                    <p class="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                </article>
            </li>
		{/each}
	</ul>
	{#if !data.preview}{#key `${data.readingScope}:${data.thread.id}`}<div id="conversation-reply" class="scroll-mt-28"><ReplyComposer readingScope={data.readingScope} conversationId={data.thread.id} ondraft={(saved) => (hasDraft = saved)} /></div>{/key}{/if}
</div>
