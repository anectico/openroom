<script lang="ts">
	import { FolderClosed, MessageSquare, Upload } from '@lucide/svelte';
	import { cn } from '#lib/utils.js';

	let { baseHref = '', active = 'documents', unreadReplies = 0, actionRequests = 0, onselect }: { baseHref?: string; active?: string; unreadReplies?: number; actionRequests?: number; onselect?: (screen: string) => void } = $props();
	const items = $derived([
		{ key: 'documents', label: 'Documents', icon: FolderClosed, suffix: '', count: 0, status: '' },
		{ key: 'questions', label: 'Questions', icon: MessageSquare, suffix: '/questions', count: unreadReplies, status: `${unreadReplies} unread ${unreadReplies === 1 ? 'reply' : 'replies'}` },
		{ key: 'requests', label: 'Requests', icon: Upload, suffix: '/requests', count: actionRequests, status: `${actionRequests} ${actionRequests === 1 ? 'request needs' : 'requests need'} action` },
	]);
</script>

<nav class="@container/nav mb-5" aria-label="Investor room">
	<div class="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border bg-muted/60 p-1 @sm/nav:gap-1.5">
		{#each items as item (item.key)}
			<a href={onselect ? `#preview-${item.key}` : `${baseHref}${item.suffix}`}
				onclick={(event) => { if (onselect) { event.preventDefault(); onselect(item.key); } }}
				class={cn('inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary @sm/nav:gap-2 @sm/nav:px-4 @sm/nav:text-sm', active === item.key ? 'bg-card text-primary shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground')}
				aria-current={active === item.key ? 'page' : undefined} title={item.count ? item.status : undefined}>
				<item.icon aria-hidden="true" class="hidden size-4 @sm/nav:block" />{item.label}
				{#if item.count}
					<span aria-hidden="true" class="rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">{item.count > 99 ? '99+' : item.count}</span>
					<span class="sr-only">{item.status}</span>
				{/if}
			</a>
		{/each}
	</div>
</nav>
