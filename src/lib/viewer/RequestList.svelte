<script lang="ts">
 import { ArrowRight } from '@lucide/svelte';
 import DueDate from './DueDate.svelte';
 import RequestStatus from './RequestStatus.svelte';

 let { linkId, requests }: { linkId: string; requests: { id: string; title: string; description: string; dueAt: number | null; status: 'Action needed' | 'Uploaded' | 'Closed' }[] } = $props();
</script>
<ul class="divide-y rounded-xl border bg-card">{#each requests as request (request.id)}<li><a class="flex min-h-24 items-center gap-4 p-4 hover:bg-muted/30" href="/v/{linkId}/requests/{request.id}"><div class="flex min-w-0 flex-1 flex-col gap-2"><div class="flex flex-wrap items-center gap-2"><RequestStatus status={request.status} />{#if request.dueAt && request.status !== 'Closed'}<span class="text-xs text-muted-foreground"><DueDate at={request.dueAt} /></span>{/if}</div><span class="break-words text-sm font-medium [overflow-wrap:anywhere]">{request.title}</span>{#if request.description}<span class="line-clamp-2 break-words text-sm text-muted-foreground">{request.description}</span>{/if}</div><ArrowRight class="size-4 shrink-0" /></a></li>{/each}</ul>
