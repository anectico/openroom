<script lang="ts">
	import { Cable, Copy, Globe, KeyRound } from '@lucide/svelte';
	import { tick } from 'svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import DetailSummary from '#lib/admin/DetailSummary.svelte';
	import { attempt, copyText, formatDate } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';

	let { data } = $props();
	let open = $state(false);
	let resultOpen = $state(false);
	let name = $state('');
	type CreatedKey = { name: string; key: string; mcpUrl: string; apiUrl: string };
	let created = $state<CreatedKey | null>(null);
	let error = $state('');
	let creating = $state(false);
	const mine = $derived(data.keys.filter((k) => k.memberId === data.member?.id));
	const others = $derived(data.keys.filter((k) => k.memberId !== data.member?.id));

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		creating = true;
		const r = await attempt<CreatedKey>('create_api_key', { name });
		creating = false;
		if (!r.ok) {
			error = r.error;
			return;
		}
		created = r.data;
		name = '';
		error = '';
		(document.activeElement as HTMLElement | null)?.blur();
		open = false;
		await tick();
		resultOpen = true;
	}

	const copy = (text: string) => copyText(text);
</script>

<svelte:head><title>API keys · Settings · OpenRoom</title></svelte:head>

<div class="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
	<p class="text-sm text-muted-foreground">
		API keys let your own agent or scripts act for you, with your role{data.member?.role === 'observer'
			? ', so they can only read'
			: ''}.
	</p>
	<Button onclick={() => { error = ''; open = true; }}>New API key</Button>
</div>

{#snippet keyTable(keys: typeof data.keys, showOwner: boolean)}
	<div class="overflow-hidden rounded-xl border bg-card">
		<Table.Root>
			<Table.Header class="hidden sm:table-header-group">
				<Table.Row>
					<Table.Head>Name</Table.Head>
					{#if showOwner}<Table.Head>Member</Table.Head>{/if}
					<Table.Head>Created</Table.Head>
					<Table.Head>Last used</Table.Head>
					<Table.Head class="w-24"><span class="sr-only">Actions</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each keys as k (k.id)}
					<Table.Row>
						<Table.Cell class="max-w-0 whitespace-normal py-4">
							<p class="font-medium break-words">{k.name ?? 'Unnamed'}</p><span class="font-mono text-xs text-muted-foreground">{k.start}…</span><p class="mt-1 text-xs break-all text-muted-foreground sm:hidden">{showOwner ? k.memberEmail : `Created ${formatDate(k.createdAt, data.timeZone)}`}<br />Last used <When at={k.lastUsedAt} timeZone={data.timeZone} /></p>
						</Table.Cell>
						{#if showOwner}<Table.Cell class="hidden text-sm sm:table-cell">{k.memberEmail}</Table.Cell>{/if}
						<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell">{formatDate(k.createdAt, data.timeZone)}</Table.Cell>
						<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"><When at={k.lastUsedAt} timeZone={data.timeZone} /></Table.Cell>
						<Table.Cell class="w-24 text-right">
							<DangerAction
								operation="revoke_api_key"
								input={{ keyId: k.id }}
								label="Revoke"
								confirmLabel="Revoke key"
								title="Revoke this API key?"
								description="Anything using this key stops working at once."
								success="Key revoked"
							/>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/snippet}

{#if mine.length === 0}
	<div class="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">You have no API keys.</div>
{:else}
	{@render keyTable(mine, false)}
{/if}

{#if others.length}
	<h2 class="mt-8 mb-3 text-base font-semibold">Other members’ keys</h2>
	{@render keyTable(others, true)}
{/if}

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>New API key</Dialog.Title><Dialog.Description>The key acts as you, with your {data.member?.role ?? ''} role, from the REST API, MCP or the CLI. You see it once, right after creating it.</Dialog.Description></Dialog.Header>
		<form class="flex flex-col gap-6" onsubmit={create}>
			<Field.Group><Field.Field data-invalid={!!error}><Field.Label for="key-name">Name</Field.Label><Input id="key-name" required maxlength={80} placeholder="My laptop agent" disabled={creating} bind:value={name} aria-invalid={!!error} /><Field.Description>Where the key is used, so you can tell keys apart later.</Field.Description>{#if error}<Field.Error>{error}</Field.Error>{/if}</Field.Field></Field.Group>
			<Dialog.Footer><Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button><Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create key'}</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={resultOpen} onOpenChange={(o) => { if (!o) created = null; }}>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
		{#if created}
			<Dialog.Header>
				<Dialog.Title>Your new API key</Dialog.Title>
				<Dialog.Description>Copy your key now. It is shown only once.</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-2">
				<Label for="created-api-key">API key</Label>
				<div class="flex min-w-0 gap-2">
					<Input id="created-api-key" readonly value={created.key} class="font-mono" />
					<Button variant="outline" onclick={() => created && copy(created.key)}><Copy aria-hidden="true" />Copy key</Button>
				</div>
			</div>
			<DetailSummary label="API connection details"
				primary={{ label: 'Key name', value: created.name, icon: KeyRound }}
				details={[
					{ label: 'MCP endpoint', value: created.mcpUrl, icon: Cable },
					{ label: 'REST API', value: created.apiUrl, icon: Globe },
				]}
			>
				<div class="col-span-full flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t px-4 py-3">
					<dt class="text-xs text-muted-foreground">Request header</dt>
					<dd class="font-mono text-xs">Authorization: Bearer &lt;key&gt;</dd>
				</div>
			</DetailSummary>
		{/if}
		<Dialog.Footer>
			<Button onclick={() => { resultOpen = false; created = null; }}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
