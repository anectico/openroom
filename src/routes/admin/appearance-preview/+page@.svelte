<script lang="ts">
	import { onMount } from 'svelte';
	import type { AppearanceDraft } from '#lib/admin/appearance-draft.ts';
	import { renderMarkdown } from '#lib/markdown.ts';
	import Entry from '../../r/[token]/+page.svelte';
	import RoomLayout from '../../v/[linkId]/+layout.svelte';
	import Documents from '../../v/[linkId]/+page.svelte';
	import Questions from '../../v/[linkId]/questions/+page.svelte';
	import Requests from '../../v/[linkId]/requests/+page.svelte';

	let { data } = $props();
	let draft = $state<AppearanceDraft>();
	let section = $state('documents');
	function select(value: string) {
		section = value;
		window.scrollTo(0, 0);
	}
	onMount(() => {
		function receive(event: MessageEvent) {
			if (event.origin !== location.origin || event.source !== window.parent || window.parent === window) return;
			if (event.data?.type !== 'appearance-draft') return;
			if (event.data.draft.screen !== draft?.screen) window.scrollTo(0, 0);
			draft = event.data.draft;
			document.documentElement.classList.toggle('phone-preview', !!draft?.phone);
		}
		window.addEventListener('message', receive);
		window.parent.postMessage({type: 'appearance-ready'}, location.origin);
		return () => window.removeEventListener('message', receive);
	});
	const branding = $derived({ logoUrl: draft?.brand.logoUrl ?? null, coverUrl: draft?.brand.coverUrl ?? null, accentColor: draft?.brand.accentColor ?? null });
	const welcomeHtml = $derived(renderMarkdown(draft?.welcome ?? ''));
	const room = $derived({
		roomName: draft?.name || 'Your data room', branding, installBranding: branding, roomId: '', linkId: '',
		welcome: { html: welcomeHtml, revision: '', personal: false, cookieName: null, savedOpen: null },
		readingScope: 'appearance-preview', email: 'investor@example.com', preview: false, downloads: data.downloads, actionRequests: 0, unreadReplies: 0,
	});
	const tree = $derived(data.tree.map((file) => ({ ...file, change: null })));
	const pins = $derived(data.pins.flatMap((id) => tree.find((file) => file.id === id) ?? []));
</script>
{#if draft}
<div class="appearance-screens">
	{#if draft.screen === 'entry'}
		<Entry appearance form={null} data={{ ...room, step: 'email', welcomeHtml, resendIn: 0, fields: [], ndaHtml: null, ndaVersionId: null, ndaDate: null, ndaChanged: false }} />
	{:else}
		<RoomLayout data={room} appearance={{section, onselect: select}}>
			{#if section === 'documents'}
				<Documents appearance data={{ ...room, tree, pins, faq: data.faq, changesSince: null, reviewStates: [], reviewedIds: [] }} />
			{:else if section === 'questions'}
				<Questions appearance data={{...room, verified: data.verified, files: [], threads: []}} />
			{:else}
				<Requests data={{...room, requests: [], submittedRequestId: null}} />
			{/if}
		</RoomLayout>
	{/if}
</div>
{/if}

<style>
	.appearance-screens :global(button:disabled) { opacity: 1; }
	:global(html.phone-preview) { scrollbar-width: none; }
	:global(html.phone-preview::-webkit-scrollbar) { display: none; }
</style>
