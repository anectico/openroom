<script lang="ts">
	import { brandStyle } from '#lib/brand.ts';
	import OpenRoomCredit from '#lib/components/OpenRoomCredit.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Signed out{data.roomName ? ` · ${data.roomName}` : ''}</title></svelte:head>

<div class="investor-brand flex min-h-dvh flex-col bg-background" style={brandStyle(data.branding.accentColor)}>
	<main class="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
		{#if data.branding.logoUrl}<img src={data.branding.logoUrl} alt="" class="mb-2 h-12 w-auto object-contain" />{/if}
		<h1 class="text-xl font-semibold [overflow-wrap:anywhere]">{data.roomName ? `You’ve signed out of ${data.roomName}` : 'You’ve signed out'}</h1>
		<p class="max-w-sm text-sm text-muted-foreground">Open your invitation link to come back.</p>
	</main>
	<p class="pb-6 text-center text-xs text-muted-foreground"><OpenRoomCredit /></p>
</div>
