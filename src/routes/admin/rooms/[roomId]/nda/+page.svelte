<script lang="ts">
	import { untrack } from 'svelte';
	import { attempt } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	const current = $derived(data.versions.find((v) => v.current) ?? null);
	let body = $state(untrack(() => data.versions.find((v) => v.current)?.bodyMarkdown ?? ''));
	let confirming = $state(false);
	let error = $state('');

	async function publish() {
		const r = await attempt('publish_nda', { roomId: room.id, bodyMarkdown: body }, 'New NDA version published');
		confirming = false;
		error = r.ok ? '' : r.error;
	}
</script>

<svelte:head><title>{room.name} · NDA · OpenRoom</title></svelte:head>

<div class="max-w-3xl space-y-4 rounded-lg border bg-background p-6">
	<p class="text-sm text-muted-foreground">
		Links that require an NDA show this text before the room. Markdown works: **bold**, lists and links.
	</p>
	<Textarea aria-label="NDA text" rows={16} bind:value={body} disabled={!canEdit} />
	{#if body.trim().length < 20}<p class="text-xs text-muted-foreground">Write at least 20 characters.</p>{/if}
	{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
	{#if canEdit}
		<Button disabled={body.trim().length < 20 || body === current?.bodyMarkdown} onclick={() => (confirming = true)}>
			{current ? 'Publish a new version' : 'Publish the NDA'}
		</Button>
	{/if}
</div>

{#if data.versions.length}
	<h2 class="mt-8 mb-3 text-lg font-medium">Versions</h2>
	<ul class="max-w-3xl divide-y rounded-lg border bg-background">
		{#each data.versions as v (v.id)}
			<li class="flex items-center justify-between px-4 py-3 text-sm">
				<span><When at={v.createdAt} timeZone={data.timeZone} /> {#if v.current}<Badge variant="secondary" class="ml-1">Current</Badge>{/if}</span>
				<span class="text-muted-foreground">{v.acceptances} acceptance{v.acceptances === 1 ? '' : 's'}</span>
			</li>
		{/each}
	</ul>
{/if}

<AlertDialog.Root bind:open={confirming}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{current ? 'Publish a new NDA version?' : 'Publish the NDA?'}</AlertDialog.Title>
			<AlertDialog.Description>
				{current
					? 'Every investor on a link that requires the NDA must accept the new version before they can continue.'
					: 'Links can then require it. Turn it on in Link defaults or per link.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<Button onclick={publish}>Publish</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
