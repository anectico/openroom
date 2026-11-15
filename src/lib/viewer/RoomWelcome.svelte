<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	let { html, name, logoUrl, coverUrl, storageKey, onDismiss, preview = false }: {
		html: string;
		name: string;
		logoUrl: string | null;
		coverUrl?: string | null;
		storageKey: string | null;
		preview?: boolean;
		onDismiss?: () => void;
	} = $props();

	let dialog: HTMLDialogElement;
	const titleId = $props.id();

	onMount(() => {
		const storage = () => preview ? sessionStorage : localStorage;
		try {
			if (storageKey && storage().getItem(storageKey)) return;
		} catch {}
		dialog.showModal();
		function remember() {
			onDismiss?.();
			if (storageKey) try { storage().setItem(storageKey, '1'); } catch {}
			document.querySelector<HTMLElement>('nav[aria-label="Investor room"] a[aria-current="page"]')?.focus({ preventScroll: true });
		}
		function sync(event: StorageEvent) {
			if (event.key === storageKey && event.newValue && dialog.open) dialog.close();
		}
		dialog.addEventListener('close', remember);
		window.addEventListener('storage', sync);
		return () => {
			dialog.removeEventListener('close', remember);
			window.removeEventListener('storage', sync);
		};
	});
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} class="welcome-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100%-2rem))] max-w-none overflow-hidden rounded-2xl border bg-card p-0 text-card-foreground shadow-xl open:flex open:flex-col">
	<div class="min-h-0 overflow-y-auto overscroll-contain">
		{#if coverUrl}<img src={coverUrl} alt="" class="h-28 w-full object-cover sm:h-36" />{/if}
		<div class="px-5 pt-6 sm:px-7 sm:pt-7">
			{#if logoUrl}<img src={logoUrl} alt="" class="mb-4 max-h-12 max-w-36 object-contain object-left" />{/if}
			<h2 id={titleId} class="text-xl font-semibold tracking-tight text-balance [overflow-wrap:anywhere] sm:text-2xl">Welcome to {name}</h2>
			<div class="md flow-root py-4 text-sm leading-relaxed [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0">{@html html}</div>
		</div>
	</div>
	<form method="dialog" class="flex shrink-0 justify-end border-t bg-muted/25 px-5 py-3 sm:px-7 sm:py-4">
		<Button type="submit" class="min-h-11">Enter room<ArrowRight data-icon="inline-end" /></Button>
	</form>
</dialog>

<style>
	.welcome-dialog::backdrop { background: rgb(12 20 18 / 45%); backdrop-filter: blur(3px); }
	:global(html:has(.welcome-dialog[open])) { overflow: hidden; }
</style>
