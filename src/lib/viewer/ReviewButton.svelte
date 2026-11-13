<script lang="ts">
 import { Check, Undo2 } from '@lucide/svelte';
 import { onDestroy } from 'svelte';
 import { Badge } from '#lib/components/ui/badge/index.js';
 import { Button } from '#lib/components/ui/button/index.js';
 import { invalidateAll } from '$app/navigation';

 let { linkId, fileId, version, reviewed, name, onupdated }: { linkId: string; fileId: string; version: number; reviewed: boolean; name: string; onupdated?: () => void } = $props();
 let busy = $state(false);
 let message = $state('');
 const controller = new AbortController();
 onDestroy(() => controller.abort());
 async function save() {
  if (busy) return;
  busy = true; message = '';
  try {
   const response = await fetch(`/v/${linkId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId, version, reviewed: !reviewed }), signal: controller.signal });
   const body = await response.json().catch(() => null);
   if (!response.ok) throw new Error(body?.error ?? 'Could not save your review. Try again.');
   await invalidateAll().catch(() => { message = 'Saved. Reload to refresh your checklist.'; });
   onupdated?.();
  } catch (e) { if (!controller.signal.aborted) message = e instanceof TypeError ? 'Connection interrupted. Try again.' : e instanceof Error ? e.message : 'Could not save.'; }
  finally { busy = false; }
 }
</script>
<div class="flex min-w-0 flex-col gap-1">
 <div class="flex flex-wrap items-center gap-1">{#if reviewed}<Badge variant="success"><Check data-icon="inline-start" />Reviewed</Badge>{/if}<Button variant="ghost" size="sm" class="min-h-11" disabled={busy} onclick={save} aria-label={reviewed ? `Undo reviewed: ${name}` : `Mark reviewed: ${name}`}>{#if reviewed}<Undo2 data-icon="inline-start" />{:else}<Check data-icon="inline-start" />{/if}{busy ? 'Saving…' : reviewed ? 'Undo' : 'Mark reviewed'}</Button></div>
 {#if message}<p class="max-w-64 px-2 text-xs text-destructive" role="status">{message}</p>{/if}
</div>
