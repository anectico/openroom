<script lang="ts">
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';

	let { data } = $props();
	const selectClass =
		'h-9 w-full max-w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm sm:w-auto focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';
	const surface = (d: Record<string, unknown> | null) => (d?.surface as string | undefined) ?? '';
	const readable = (op: string) => op.replace(/^server\./, 'server: ').replaceAll('_', ' ');
	const csvHref = $derived(`/admin/audit/csv?${new URLSearchParams({ ...data.query, before: '' }).toString()}`);
	const olderHref = $derived(`?${new URLSearchParams({ ...data.query, before: String(data.nextBefore ?? '') })}`);
	const filtered = $derived(!!(data.query.member || data.query.operation || data.query.days));
</script>

<svelte:head><title>Audit log · OpenRoom</title></svelte:head>

<h1 class="mb-2 text-2xl font-semibold">Audit log</h1>
<p class="mb-6 text-sm text-muted-foreground">Every change members, API keys and the server tools made. It cannot be edited.</p>

<form class="mb-4 flex min-w-0 flex-wrap items-end gap-3" method="GET">
	{#if data.members.length}
		<div class="min-w-0 max-w-full space-y-1">
			<Label for="f-member" class="text-xs text-muted-foreground">Member</Label>
			<select id="f-member" name="member" class={selectClass} value={data.query.member ?? ''}>
				<option value="">Everyone</option>
				{#each data.members as m (m.id)}<option value={m.id}>{m.name} ({m.email})</option>{/each}
			</select>
		</div>
	{/if}
	<div class="min-w-0 max-w-full space-y-1">
		<Label for="f-op" class="text-xs text-muted-foreground">Operation</Label>
		<select id="f-op" name="operation" class={selectClass} value={data.query.operation ?? ''}>
			<option value="">Any</option>
			{#each data.operations as o (o)}<option value={o}>{readable(o)}</option>{/each}
		</select>
	</div>
	<div class="min-w-0 max-w-full space-y-1">
		<Label for="f-days" class="text-xs text-muted-foreground">When</Label>
		<select id="f-days" name="days" class={selectClass} value={data.query.days ?? ''}>
			<option value="">Any time</option>
			<option value="1">Last 24 hours</option>
			<option value="7">Last 7 days</option>
			<option value="30">Last 30 days</option>
		</select>
	</div>
	<Button type="submit" variant="outline">Filter</Button>
	{#if filtered}<a class="text-sm hover:underline" href="/admin/audit">Clear</a>{/if}
	<Button href={csvHref} variant="ghost" class="ml-auto" download>Export CSV</Button>
</form>

{#if data.entries.length === 0}
	<div class="rounded-lg border bg-background p-8 text-center text-muted-foreground">
		{filtered ? 'No entries match these filters.' : 'Nothing has been changed yet.'}
	</div>
{:else}
	<div class="overflow-hidden rounded-xl border bg-card">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="hidden sm:table-cell">When</Table.Head>
					<Table.Head class="hidden md:table-cell">Member</Table.Head>
					<Table.Head class="hidden lg:table-cell">API key</Table.Head>
					<Table.Head>Operation</Table.Head>
					<Table.Head class="hidden md:table-cell">Target</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.entries as e (e.id)}
					<Table.Row>
						<Table.Cell class="hidden text-sm whitespace-nowrap sm:table-cell"><When at={e.at} timeZone={data.timeZone} /></Table.Cell>
						<Table.Cell class="hidden text-sm md:table-cell">{e.memberName ?? (e.memberId ? 'Removed member' : 'Server')}</Table.Cell>
						<Table.Cell class="hidden text-sm lg:table-cell">
							{#if e.apiKeyId}<Badge variant="outline">{surface(e.detail) === 'mcp' ? 'MCP' : 'API key'}</Badge>{/if}
						</Table.Cell>
						<Table.Cell class="whitespace-normal py-3 text-sm"><p class="font-medium">{readable(e.operation)}</p><p class="mt-1 text-xs text-muted-foreground md:hidden">{e.memberName ?? 'Server'} · {surface(e.detail) || 'server'}</p><p class="mt-1 text-[11px] text-muted-foreground sm:hidden"><When at={e.at} timeZone={data.timeZone} /></p></Table.Cell>
						<Table.Cell class="hidden font-mono text-xs text-muted-foreground md:table-cell">
							{#if e.roomId}<a class="hover:underline" href="/admin/rooms/{e.roomId}">room</a>{#if e.targetType !== 'room'} · {/if}{/if}
							{#if e.targetType !== 'room'}{e.targetType ?? ''} {e.targetId ?? ''}{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

<div class="mt-4 flex gap-4 text-sm">
	{#if data.paged}<a class="hover:underline" href="?{new URLSearchParams({ ...data.query, before: '' })}">Newest</a>{/if}
	{#if data.nextBefore}<a class="hover:underline" href={olderHref}>Older</a>{/if}
</div>
