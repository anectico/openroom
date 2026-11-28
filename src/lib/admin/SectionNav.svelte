<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { goto } from '$app/navigation';

	let { label, tabs, activeHref, current }: {
		label: string;
		tabs: { href: string; label: string; icon: typeof ChevronDown; count?: number }[];
		activeHref?: string;
		current: string;
	} = $props();
</script>

<div class="@container mb-4 sm:mb-6">
	<div class="border-b pb-1.5">
		<nav class="hidden flex-wrap gap-1 @min-[36rem]:flex" aria-label={label}>
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					aria-current={activeHref === tab.href ? 'page' : undefined}
					class="inline-flex min-h-9 items-center rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-card/70 hover:text-foreground aria-[current=page]:border-primary/45 aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
				>{tab.label}{#if tab.count}<span class="ml-1.5 flex min-w-5 items-center justify-center rounded-md bg-attention px-1 text-xs font-semibold text-attention-foreground">{tab.count}<span class="sr-only"> need attention</span></span>{/if}</a>
			{/each}
		</nav>
		<div class="min-w-0 @min-[36rem]:hidden">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" class="min-h-11 max-w-full" aria-label="{label} section: {current}">
							<span class="truncate">{current}</span><ChevronDown data-icon="inline-end" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="min-w-44">
					<DropdownMenu.Group>
						{#each tabs as tab (tab.href)}
							<DropdownMenu.Item aria-current={activeHref === tab.href ? 'page' : undefined} class="aria-[current=page]:font-semibold aria-[current=page]:text-primary" onSelect={() => goto(tab.href)}><tab.icon aria-hidden="true" />{tab.label}{#if tab.count}<span class="ml-auto flex min-w-5 items-center justify-center rounded-md bg-attention px-1 text-xs font-semibold text-attention-foreground">{tab.count}<span class="sr-only"> need attention</span></span>{/if}</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Group>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
</div>
