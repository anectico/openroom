<script lang="ts">
 import { RefreshCw } from '@lucide/svelte';
 import LocalTime from './LocalTime.svelte';

 let { state }: { state: { version: number | null; updatedAt: number; previousVersion: number | null } | null | undefined } = $props();
</script>
{#if state?.previousVersion}<p class="mt-2 flex items-start gap-1.5 text-xs font-medium text-attention-foreground" role="status"><RefreshCw class="mt-0.5 size-3 shrink-0" /><span>{(state.version ?? 0) > state.previousVersion ? 'New version — review again' : 'Version changed — review again'}</span></p><p class="mt-1 text-xs text-muted-foreground">Version {state.version} · <LocalTime at={state.updatedAt} /><span class="block">Previously reviewed: version {state.previousVersion}</span></p>{/if}
