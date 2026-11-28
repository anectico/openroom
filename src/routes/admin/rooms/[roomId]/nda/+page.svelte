<script lang="ts">
	import { untrack } from 'svelte';
	import { attempt, formatDate } from '#lib/admin/op.ts';
	import SectionHeading from '#lib/admin/SectionHeading.svelte';
	import When from '#lib/admin/When.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { renderMarkdown } from '#lib/markdown.ts';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	const current = $derived(data.versions.find((v) => v.current) ?? null);
	let body = $state(untrack(() => data.versions.find((v) => v.current)?.bodyMarkdown ?? ''));
	let pane = $state('edit');
	let confirming = $state(false);
	let error = $state('');
	let publishing = $state(false);
	let viewing = $state<(typeof data.versions)[number] | null>(null);
	const length = $derived(body.trim().length);
	const tooShort = $derived(length > 0 && length < 20);
	const unchanged = $derived(body === (current?.bodyMarkdown ?? ''));
	const required = $derived(data.requiredByActiveLinks);

	async function publish() {
		if (publishing) return;
		publishing = true;
		const r = await attempt('publish_nda', { roomId: room.id, bodyMarkdown: body }, 'New NDA version published');
		publishing = false;
		confirming = false;
		error = r.ok ? '' : r.error;
	}
</script>

<svelte:head><title>{room.name} · NDA · OpenRoom</title></svelte:head>

<SectionHeading title="NDA" description="Links that require an NDA show this agreement before the room opens. Each published version is kept with its acceptances.">
	{#snippet actions()}
		<Badge variant={required ? 'secondary' : 'outline'}>Required by {required} active link{required === 1 ? '' : 's'}</Badge>
	{/snippet}
</SectionHeading>

<section class="max-w-3xl rounded-xl border bg-card p-4 sm:p-5">
	<Tabs.Root bind:value={pane}>
		<Tabs.List aria-label="NDA editor"><Tabs.Trigger value="edit" class="min-h-11 sm:min-h-8">{canEdit ? 'Edit' : 'Text'}</Tabs.Trigger><Tabs.Trigger value="preview" class="min-h-11 sm:min-h-8">Preview</Tabs.Trigger></Tabs.List>
		<Tabs.Content value="edit" class="pt-3">
			<Textarea aria-label="NDA text" aria-describedby="nda-help" rows={16} class="max-h-[60dvh]" bind:value={body} disabled={!canEdit} />
			<p id="nda-help" class="mt-2 text-xs text-muted-foreground">Markdown works: **bold**, lists and links.{#if tooShort} <span class="font-medium text-foreground">Write at least 20 characters to publish ({length} so far).</span>{/if}</p>
		</Tabs.Content>
		<Tabs.Content value="preview" class="pt-3">
			{#if body.trim()}
				<div class="md max-h-[32rem] overflow-y-auto rounded-lg border bg-background p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">{@html renderMarkdown(body)}</div>
			{:else}
				<p class="text-sm text-muted-foreground">Nothing to preview yet. Write the agreement in Edit.</p>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
	{#if error}<p class="mt-3 text-sm text-destructive" role="alert">{error}</p>{/if}
	{#if canEdit}
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<Button disabled={length < 20 || unchanged} onclick={() => (confirming = true)}>
				{current ? 'Publish a new version' : 'Publish the NDA'}
			</Button>
			{#if current && !unchanged}<Button variant="ghost" onclick={() => (body = current.bodyMarkdown)}>Discard changes</Button>{/if}
		</div>
	{/if}
</section>

{#if data.versions.length}
	<h3 class="mt-8 mb-3 text-base font-semibold">Versions</h3>
	<ul class="max-w-3xl divide-y rounded-xl border bg-card">
		{#each data.versions as v (v.id)}
			<li>
				<button type="button" class="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-muted/40" onclick={() => (viewing = v)}>
					<span class="flex items-center gap-2"><span class="font-medium underline-offset-2 hover:underline">Version of <When at={v.createdAt} timeZone={data.timeZone} /></span>{#if v.current}<Badge variant="secondary">Current</Badge>{/if}</span>
					<span class="text-xs text-muted-foreground">{v.acceptances} acceptance{v.acceptances === 1 ? '' : 's'}</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

<Dialog.Root open={!!viewing} onOpenChange={(o) => !o && (viewing = null)}>
	<Dialog.Content class="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
		<Dialog.Header class="shrink-0 border-b px-5 py-4 pr-14">
			<Dialog.Title>NDA version of {viewing ? formatDate(viewing.createdAt, data.timeZone) : ''}</Dialog.Title>
			<Dialog.Description>Read only. {viewing?.current ? 'This is the version investors accept now.' : 'Investors who accepted it keep this record.'} {viewing?.acceptances ?? 0} acceptance{viewing?.acceptances === 1 ? '' : 's'}.</Dialog.Description>
		</Dialog.Header>
		<div class="md min-h-0 overflow-y-auto p-5 text-sm leading-relaxed [overflow-wrap:anywhere]">{@html viewing ? renderMarkdown(viewing.bodyMarkdown) : ''}</div>
		<Dialog.Footer class="shrink-0 border-t px-5 py-3">
			{#if canEdit && viewing && !viewing.current}<Button variant="outline" onclick={() => { if (viewing) body = viewing.bodyMarkdown; viewing = null; pane = 'edit'; }}>Copy into the editor</Button>{/if}
			<Button onclick={() => (viewing = null)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={() => confirming, (value) => { if (!publishing) confirming = value; }}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{current ? 'Publish a new NDA version?' : 'Publish the NDA?'}</AlertDialog.Title>
			<AlertDialog.Description>
				{current
					? `Every investor on the ${required} active link${required === 1 ? '' : 's'} that require the NDA must accept the new version before they can continue.`
					: 'Links can then require it. Turn it on in Link defaults or per link.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={publishing}>Cancel</AlertDialog.Cancel>
			<Button disabled={publishing} onclick={publish}>{publishing ? 'Publishing…' : 'Publish'}</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
