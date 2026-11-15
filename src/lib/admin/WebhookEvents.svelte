<script lang="ts">
	let { catalog, events = $bindable() }: { catalog: Record<string, string>; events: string[] | null } = $props();
	const id = $props.id();
</script>

<fieldset class="min-w-0">
	<legend class="mb-2 text-sm font-medium">Events to send</legend>
	<div class="flex flex-wrap gap-x-5 gap-y-2">
		<label class="flex items-center gap-2 text-sm"><input type="radio" name={id} checked={events === null} onchange={() => (events = null)} class="accent-primary" />All events</label>
		<label class="flex items-center gap-2 text-sm"><input type="radio" name={id} checked={events !== null} onchange={() => (events = [])} class="accent-primary" />Selected events</label>
	</div>
	{#if events !== null}
		<div class="mt-3 grid gap-1 rounded-lg border p-2">
			{#each Object.entries(catalog) as [key, label] (key)}
				<label class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
					<input type="checkbox" value={key} bind:group={events} class="mt-0.5 size-4 shrink-0 accent-primary" />
					{label}
				</label>
			{/each}
		</div>
	{/if}
</fieldset>
