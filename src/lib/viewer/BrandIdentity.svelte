<script lang="ts">
 import { FolderClosed } from '@lucide/svelte';

 let { name, logoUrl }: { name: string; logoUrl: string | null } = $props();
</script>

<span class="@container/identity block min-w-0 flex-1">
 <span class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
  {#if logoUrl}<img src={logoUrl} alt={`${name} logo`} class="max-h-12 w-auto max-w-40 object-contain object-left @sm/identity:max-h-14 @sm/identity:max-w-48" />{:else}<span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><FolderClosed class="size-6" strokeWidth={1.6} /></span>{/if}
  <span class="min-w-0 flex-1 basis-32"><span class="mb-1 block text-[10px] font-semibold tracking-[0.16em] text-primary uppercase">Private investor room</span><span class="line-clamp-2 block break-words text-sm font-semibold tracking-tight [overflow-wrap:anywhere]">{name}</span></span>
 </span>
</span>
