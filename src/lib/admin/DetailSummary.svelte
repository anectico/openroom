<script lang="ts">
	import type { Users } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	type Detail = { label: string; value: string; icon: typeof Users };
	let { label, primary, details, children }: { label: string; primary: Detail; details: Detail[]; children?: Snippet } = $props();
</script>

<dl aria-label={label} class="grid min-w-0 shrink-0 grid-cols-2 overflow-hidden rounded-xl border bg-card text-sm max-[359px]:grid-cols-1">
	<div class="relative col-span-full border-b bg-primary/5 py-3 pr-4 pl-16">
		<dt class="text-xs font-medium text-muted-foreground">
			<span class="absolute top-1/2 left-4 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-primary/15 bg-card text-primary"><primary.icon aria-hidden="true" class="size-4" /></span>
			{primary.label}
		</dt>
		<dd class="mt-0.5 font-semibold [overflow-wrap:anywhere]">{primary.value}</dd>
	</div>
	{#each details as detail (detail.label)}
		<div class="min-w-0 px-4 py-2.5">
			<dt class="flex items-center gap-1.5 text-xs text-muted-foreground"><detail.icon aria-hidden="true" class="size-3.5" />{detail.label}</dt>
			<dd class="mt-1 font-medium [overflow-wrap:anywhere]">{detail.value}</dd>
		</div>
	{/each}
	{@render children?.()}
</dl>
