<script lang="ts">
	import { page } from '$app/state';

	const branding = $derived(page.data.installBranding);
</script>

<svelte:head><title>Link not available</title></svelte:head>

<main class="flex min-h-[90vh] flex-col items-center justify-center gap-2 px-4 text-center">
	{#if branding?.logoUrl}<img src={branding.logoUrl} alt="" class="mb-2 h-12 w-auto object-contain" />{/if}
	<h1 class="text-xl font-semibold">This link is not available</h1>
	<p class="max-w-sm text-sm text-muted-foreground">
		Check that you opened the whole link, or ask the person who sent it to you for a new one.
	</p>
</main>
{#if !branding?.whiteLabel}<p class="pb-6 text-center text-xs text-muted-foreground">Powered by OpenRoom</p>{/if}
