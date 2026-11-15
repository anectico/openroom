<script lang="ts" generics="T extends string">
	import * as Select from '#lib/components/ui/select/index.js';
	import { cn } from '#lib/utils.js';

	type Option = { value: T; label: string; disabled?: boolean };
	let {
		value = $bindable(), options = [], groups = [], placeholder, name, id, label,
		disabled = false, required = false, class: className,
	}: {
		value: T;
		options?: readonly Option[];
		groups?: { label: string; options: Option[] }[];
		placeholder?: string;
		name?: string;
		id?: string;
		label?: string;
		disabled?: boolean;
		required?: boolean;
		class?: string;
	} = $props();
	const allOptions = $derived([...options, ...groups.flatMap((group) => group.options)]);
	const selected = $derived(allOptions.find((option) => option.value === value));
	function choose(next: string) {
		const option = allOptions.find((item) => item.value === next);
		if (option && !option.disabled) value = option.value;
	}
</script>

{#snippet items(list: readonly Option[])}
	{#each list as option (option.value)}
		<Select.Item value={option.value} label={option.label} disabled={option.disabled} />
	{/each}
{/snippet}

<Select.Root type="single" bind:value={() => value, choose} items={allOptions} {name} {disabled} {required}>
	<Select.Trigger {id} aria-label={label} class={cn('max-w-full min-w-0 bg-card', className)}>
		<span class="truncate">{selected?.label ?? placeholder}</span>
	</Select.Trigger>
	<Select.Content align="start" class="max-w-[calc(100vw-1rem)]">
		{#if options.length}
			<Select.Group>{@render items(options)}</Select.Group>
		{/if}
		{#each groups as group (group.label)}
			{#if group.options.length}
				<Select.Group><Select.GroupHeading>{group.label}</Select.GroupHeading>{@render items(group.options)}</Select.Group>
			{/if}
		{/each}
	</Select.Content>
</Select.Root>
