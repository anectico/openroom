<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, actions }: { title: string; description?: string; actions?: Snippet } = $props();
</script>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0 flex-1">
		<h2 class="text-lg leading-tight font-semibold tracking-[-0.02em] sm:text-xl">{title}</h2>
		{#if description}<p class="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>{/if}
	</div>
	{#if actions}<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
