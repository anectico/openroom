<script lang="ts">
 import { FolderClosed, MessageSquare, Upload } from '@lucide/svelte';
 import { Badge } from '#lib/components/ui/badge/index.js';
 import { cn } from '#lib/utils.js';

 let { baseHref = '', active = 'documents', unreadReplies = 0, actionRequests = 0, onselect }: { baseHref?: string; active?: string; unreadReplies?: number; actionRequests?: number; onselect?: (screen: string) => void } = $props();
 const items = [{ key: 'documents', label: 'Documents', icon: FolderClosed, suffix: '' }, { key: 'questions', label: 'Questions', icon: MessageSquare, suffix: '/questions' }, { key: 'requests', label: 'Requests', icon: Upload, suffix: '/requests' }];
</script>
<div class="@container/nav">
 <nav class="mx-auto flex max-w-6xl gap-3 px-4 @xl/nav:gap-7 @xl/nav:px-8" aria-label="Investor room">
  {#each items as item}
   <a href={onselect ? `#preview-${item.key}` : `${baseHref}${item.suffix}`} onclick={(event) => { if (onselect) { event.preventDefault(); onselect(item.key); } }} class={cn('flex min-h-11 min-w-0 items-center gap-1 border-b-2 py-3 text-xs font-medium @xl/nav:gap-2', active === item.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')} aria-current={active === item.key ? 'page' : undefined}><item.icon class="hidden size-3.5 @xl/nav:block" />{item.label}{#if item.key === 'questions' && unreadReplies}<Badge variant="secondary" aria-label="{unreadReplies} unread {unreadReplies === 1 ? 'reply' : 'replies'}">{unreadReplies}</Badge>{:else if item.key === 'requests' && actionRequests}<Badge variant="secondary" aria-label="{actionRequests} {actionRequests === 1 ? 'request needs' : 'requests need'} action">{actionRequests}</Badge>{/if}</a>
  {/each}
 </nav>
</div>
