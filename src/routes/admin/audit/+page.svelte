<script lang="ts">
	import { ArrowDownToLine, Bell, FileText, FolderClosed, KeyRound, Link2, ListFilter, MessageSquare, ScrollText, Users, Webhook } from '@lucide/svelte';
	import type { AuditEntry } from '#lib/admin/audit.ts';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import When from '#lib/admin/When.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';

	let { data } = $props();
	let member = $derived(data.query.member ?? '');
	let operation = $derived(data.query.operation ?? '');
	let days = $derived(data.query.days ?? '');
	const sources: Record<string, string> = { admin: 'Dashboard', rest: 'REST API', mcp: 'MCP', server: 'Server tools' };
	const icons: Record<string, typeof ScrollText> = {
		room: FolderClosed, link: Link2, file: FileText, member: Users, api_key: KeyRound,
		faq: MessageSquare, question: MessageSquare, notices: Bell, webhook: Webhook,
	};
	const roomNames = $derived(new Map(data.sidebarRooms.map((room) => [room.id, room.name])));
	function readable(value: string) {
		return value.replaceAll('_', ' ').replace(/^server\./, 'Server · ')
			.replace(/\b(api|nda|faq|mcp)\b/gi, (word) => word.toUpperCase())
			.replace(/^./, (letter) => letter.toUpperCase());
	}
	function source(entry: AuditEntry) {
		const origin = entry.detail?.surface;
		const name = typeof origin === 'string' ? sources[origin] : '';
		return [name, entry.apiKeyId ? 'API key' : ''].filter(Boolean).join(' · ');
	}
	const csvHref = $derived(`/admin/audit/csv?${new URLSearchParams({ ...data.query, before: '' }).toString()}`);
	const olderHref = $derived(`?${new URLSearchParams({ ...data.query, before: String(data.nextBefore ?? '') })}`);
	const filtered = $derived(!!(data.query.member || data.query.operation || data.query.days));
</script>

<svelte:head><title>Audit log · OpenRoom</title></svelte:head>

<h1 class="mb-2 text-2xl font-semibold">Audit log</h1>
<p class="mb-6 text-sm text-muted-foreground">Every change members, API keys and the server tools made. It cannot be edited.</p>

<section class="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="Audit entries">
<form class="grid min-w-0 grid-cols-2 items-end gap-3 border-b bg-muted/25 p-4 sm:flex sm:flex-wrap sm:px-5" method="GET">
	{#if data.members.length}
		<div class="grid min-w-0 max-w-full gap-1.5">
			<Label for="f-member" class="text-xs text-muted-foreground">Member</Label>
			<ChoiceSelect id="f-member" name="member" class="w-full sm:w-fit" bind:value={member}
				options={[{ value: '', label: 'Everyone' }, ...data.members.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }))]}
			/>
		</div>
	{/if}
	<div class="grid min-w-0 max-w-full gap-1.5">
		<Label for="f-op" class="text-xs text-muted-foreground">Operation</Label>
		<ChoiceSelect id="f-op" name="operation" class="w-full sm:w-fit" bind:value={operation}
			options={[{ value: '', label: 'Any' }, ...data.operations.map((o) => ({ value: o, label: readable(o) }))]}
		/>
	</div>
	<div class="grid min-w-0 max-w-full gap-1.5">
		<Label for="f-days" class="text-xs text-muted-foreground">When</Label>
		<ChoiceSelect id="f-days" name="days" class="w-full sm:w-fit" bind:value={days}
			options={[{ value: '', label: 'Any time' }, { value: '1', label: 'Last 24 hours' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }]}
		/>
	</div>
	<Button type="submit" variant="outline"><ListFilter aria-hidden="true" />Filter</Button>
	{#if filtered}<Button variant="ghost" href="/admin/audit">Clear</Button>{/if}
	<Button href={csvHref} variant="ghost" class="col-span-full justify-self-end sm:ml-auto" download><ArrowDownToLine aria-hidden="true" />Export CSV</Button>
</form>

{#if data.entries.length === 0}
	<div class="p-8 text-center text-muted-foreground">
		{filtered ? 'No entries match these filters.' : 'Nothing has been changed yet.'}
	</div>
{:else}
	<Table.Root>
		<Table.Header class="bg-muted/15">
			<Table.Row>
				<Table.Head class="pl-5">Operation</Table.Head>
				<Table.Head class="hidden md:table-cell">Performed by</Table.Head>
				<Table.Head class="hidden sm:table-cell">Target</Table.Head>
				<Table.Head class="hidden pr-5 text-right md:table-cell">When</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.entries as entry (entry.id)}
				{@const Icon = icons[entry.targetType ?? ''] ?? ScrollText}
				{@const actor = entry.memberName ?? (entry.memberId ? 'Removed member' : 'Server')}
				{@const origin = source(entry)}
				<Table.Row>
					<Table.Cell class="py-3.5 pl-5 whitespace-normal">
						<div class="flex items-start gap-3">
							<span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon class="size-4" aria-hidden="true" /></span>
							<div class="min-w-0 self-center">
								<p class="text-sm font-medium [overflow-wrap:anywhere]">{readable(entry.operation)}</p>
								<p class="mt-1 text-xs text-muted-foreground md:hidden">{actor}{origin ? ` · ${origin}` : ''} · <When at={entry.at} timeZone={data.timeZone} /></p>
								<div class="mt-1 sm:hidden">{@render target(entry)}</div>
							</div>
						</div>
					</Table.Cell>
					<Table.Cell class="hidden whitespace-normal md:table-cell"><p class="text-sm [overflow-wrap:anywhere]">{actor}</p>{#if origin}<p class="text-xs text-muted-foreground">{origin}</p>{/if}</Table.Cell>
					<Table.Cell class="hidden max-w-xs whitespace-normal sm:table-cell">{@render target(entry)}</Table.Cell>
					<Table.Cell class="hidden pr-5 text-right text-xs text-muted-foreground md:table-cell"><When at={entry.at} timeZone={data.timeZone} /></Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
</section>

{#snippet target(entry: AuditEntry)}
	<div class="grid min-w-0 justify-items-start gap-0.5 text-xs">
		{#if entry.roomId}<a class="text-primary underline-offset-2 hover:underline [overflow-wrap:anywhere]" href="/admin/rooms/{entry.roomId}">{roomNames.get(entry.roomId) ?? 'Room'}</a>{/if}
		{#if entry.targetType !== 'room' || !entry.roomId}
			<span class="text-muted-foreground [overflow-wrap:anywhere]">{entry.targetType ? readable(entry.targetType) : entry.roomId || entry.targetId ? '' : '—'}{entry.targetId ? ' ' : ''}<span class="font-mono text-[11px]">{entry.targetId ?? ''}</span></span>
		{/if}
	</div>
{/snippet}

<div class="mt-4 flex gap-4 text-sm">
	{#if data.paged}<a class="hover:underline" href="?{new URLSearchParams({ ...data.query, before: '' })}">Newest</a>{/if}
	{#if data.nextBefore}<a class="hover:underline" href={olderHref}>Older</a>{/if}
</div>
