<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: Snippet } = $props();
</script>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-7 sm:items-end sm:gap-4">
	<div class="min-w-0 flex-1">
		{#if eyebrow}<p class="mb-2 hidden text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase sm:block">{eyebrow}</p>{/if}
		<h1 class="text-2xl leading-tight font-semibold tracking-[-0.035em] sm:text-[32px]">{title}</h1>
		{#if description}<p class="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p>{/if}
	</div>
	{#if actions}<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
