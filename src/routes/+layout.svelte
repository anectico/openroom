<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { brandIcon } from '#lib/brand.ts';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={page.url.pathname.startsWith('/r/') || page.url.pathname.startsWith('/v/') ? brandIcon(page.data.branding?.logoUrl ?? page.data.installBranding?.logoUrl ?? null) ?? favicon : favicon} />
</svelte:head>

{@render children()}
