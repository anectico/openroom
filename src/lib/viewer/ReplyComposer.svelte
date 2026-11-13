<script lang="ts">
 import { onMount } from 'svelte';
 import { Button } from '#lib/components/ui/button/index.js';
 import * as Field from '#lib/components/ui/field/index.js';
 import { Textarea } from '#lib/components/ui/textarea/index.js';
 import type { SubmitFunction } from '$app/forms';
 import { enhance } from '$app/forms';

 let { readingScope, conversationId, ondraft }: { readingScope: string; conversationId: string; ondraft?: (saved: boolean) => void } = $props();
 let draft = $state('');
 let busy = $state(false);
 let message = $state('');
 let restored = $state(false);
 let storageAvailable = $state(true);
 $effect(() => { ondraft?.(!!draft.trim()); });
 const key = $derived(`openroom:draft:${readingScope}:${conversationId}`);
 onMount(() => { try { const saved = sessionStorage.getItem(key); if (saved) { draft = saved.slice(0, 5000); restored = true; } } catch { storageAvailable = false; } });
 function save() { try { if (draft) sessionStorage.setItem(key, draft); else sessionStorage.removeItem(key); } catch { storageAvailable = false; } }
 const submit: SubmitFunction = ({ cancel }) => {
  if (busy || !draft.trim()) { cancel(); return; }
  busy = true; message = ''; save();
  return async ({ result, update }) => {
   try {
    if (result.type === 'success') { draft = ''; restored = false; save(); message = 'Reply sent.'; await update({ reset: true }); }
    else if (result.type === 'failure') { message = typeof result.data?.error === 'string' ? result.data.error : 'Your reply was not sent. Try again.'; }
    else if (result.type === 'redirect') { message = 'Access changed. Your draft is still in this tab.'; await update({ reset: false }); }
    else message = 'Could not confirm delivery. Your draft is still here. Check the conversation before retrying.';
   } catch { message = 'Your reply may have been sent. Reload the conversation before retrying.'; }
   finally { busy = false; }
  };
 };
</script>
<form method="POST" class="flex flex-col gap-3 rounded-xl border bg-card p-4" use:enhance={submit}>
 <Field.Field><Field.Label for="reply">Reply to the team</Field.Label><Textarea id="reply" name="body" rows={4} maxlength={5000} required bind:value={draft} oninput={(event) => { draft = event.currentTarget.value; save(); }} readonly={busy} placeholder="Write your reply…" /></Field.Field>
 <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-muted-foreground">{!storageAvailable ? 'Draft saving is unavailable in this browser.' : restored ? 'Draft restored in this tab.' : 'Draft saved in this tab as you type.'}</p><Button type="submit" class="min-h-11" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send reply'}</Button></div>
 {#if message}<p class="text-sm" role="status">{message}</p>{/if}
</form>
