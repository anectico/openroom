<script lang="ts">
	import { ArrowLeft, FileX } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { page } from '$app/state';

	const copy = $derived.by(() => {
		if (page.status === 401)
			return { title: 'Your session has ended', body: 'Open your invitation link and we’ll bring you back here.' };
		if (page.status >= 500)
			return { title: 'Something went wrong', body: 'Reload the page. If it keeps happening, tell the person who sent you the link.' };
		const route = page.route.id ?? '';
		if (route.startsWith('/v/[linkId]/view/'))
			return { title: 'This document is no longer shared with you', body: 'It may have been removed, replaced or moved out of your access. The documents you can open are listed on the Documents tab.' };
		if (route.startsWith('/v/[linkId]/requests/'))
			return { title: 'This request is closed', body: 'The team closed this file request or it is no longer open to you. Open requests are listed on the Requests tab.' };
		if (route.startsWith('/v/[linkId]/questions/'))
			return { title: 'This conversation is not available', body: 'It may have been removed. Your other questions are listed on the Questions tab.' };
		return { title: 'This page is not available', body: 'The page you opened is not part of this room.' };
	});
	const back = $derived.by(() => {
		const route = page.route.id ?? '';
		const base = `/v/${page.params.linkId}`;
		if (route.startsWith('/v/[linkId]/requests/')) return { href: `${base}/requests`, label: 'Back to Requests' };
		if (route.startsWith('/v/[linkId]/questions/')) return { href: `${base}/questions`, label: 'Back to Questions' };
		return { href: base, label: 'Back to Documents' };
	});
</script>

<svelte:head><title>{copy.title}{page.data.roomName ? ` · ${page.data.roomName}` : ''}</title></svelte:head>

<Empty.Root class="rounded-xl border bg-card py-14">
	<Empty.Header>
		<Empty.Media variant="icon"><FileX /></Empty.Media>
		<Empty.Title><h1>{copy.title}</h1></Empty.Title>
		<Empty.Description>{copy.body}</Empty.Description>
	</Empty.Header>
	{#if page.status !== 401}
		<Empty.Content><Button href={back.href} variant="outline"><ArrowLeft data-icon="inline-start" />{back.label}</Button></Empty.Content>
	{/if}
</Empty.Root>
