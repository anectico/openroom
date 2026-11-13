<script lang="ts">
 import { untrack } from 'svelte';
 import * as Empty from '#lib/components/ui/empty/index.js';
 import RequestList from '#lib/viewer/RequestList.svelte';

 let { data } = $props();
 const submittedId = $derived(data.submittedRequestId);
 let showHistory = $state(untrack(() => !!submittedId));
 $effect(() => { showHistory = !!submittedId; });
 const submitted = $derived(data.requests.find((r) => r.id === data.submittedRequestId));
 const active = $derived(data.requests.filter((r) => r.status === 'Action needed'));
 const history = $derived(data.requests.filter((r) => r.status !== 'Action needed'));
</script>
<svelte:head><title>Requests · {data.roomName}</title></svelte:head>
<div class="mx-auto flex max-w-3xl flex-col gap-5"><div><h1 class="text-xl font-semibold">Requests</h1><p class="mt-2 text-sm text-muted-foreground">Files requested by the team. Your submissions stay private.</p></div>
{#if submitted}<section class="rounded-xl border bg-card p-4" aria-label="Recent submission"><h2 class="text-sm font-semibold">Submission received</h2><a class="mt-1 flex min-h-11 items-center text-sm text-primary underline underline-offset-4 [overflow-wrap:anywhere]" href="/v/{data.linkId}/requests/{submitted.id}">{submitted.title}</a><p class="text-xs text-muted-foreground">Open the request to see your receipt and submissions.</p></section>{/if}
{#if active.length}<h2 class="text-sm font-semibold">Action needed ({active.length})</h2><RequestList linkId={data.linkId} requests={active} />{:else}<Empty.Root class="rounded-xl border bg-card"><Empty.Header><Empty.Title>{history.length ? 'You’re up to date' : 'No requests yet'}</Empty.Title><Empty.Description>{history.length ? 'There are no requests waiting for your first submission.' : 'Requests from the team will appear here.'}</Empty.Description></Empty.Header></Empty.Root>{/if}
{#if history.length}<details bind:open={showHistory} class="rounded-xl border bg-card"><summary class="min-h-12 cursor-pointer p-4 text-sm font-medium">Submissions & history ({history.length})</summary><div class="px-3 pb-3"><p class="mb-3 text-xs text-muted-foreground">Uploaded confirms receipt, not review or approval. Open requests can accept additional files.</p><RequestList linkId={data.linkId} requests={history} /></div></details>{/if}</div>
