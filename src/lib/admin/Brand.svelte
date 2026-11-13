<script lang="ts">
	import { DoorOpen } from '@lucide/svelte';

	let { compact = false }: { compact?: boolean } = $props();
</script>

<span class="inline-flex items-center gap-2.5">
	<span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><DoorOpen class="size-[19px]" strokeWidth={1.8} /></span>
	{#if !compact}<span class="text-[17px] font-semibold tracking-tight">OpenRoom<span class="ml-0.5 text-primary">.</span></span>{/if}
</span>
