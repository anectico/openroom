<script lang="ts">
	import { tick } from 'svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { attempt, copyText, formatDate } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';

	let { data } = $props();
	let open = $state(false);
	let resultOpen = $state(false);
	let name = $state('');
	let created = $state<{ key: string; mcpUrl: string; apiUrl: string } | null>(null);
	let error = $state('');
	const mine = $derived(data.keys.filter((k) => k.memberId === data.member?.id));
	const others = $derived(data.keys.filter((k) => k.memberId !== data.member?.id));

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const r = await attempt<{ key: string; mcpUrl: string; apiUrl: string }>('create_api_key', { name });
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
	<Button onclick={() => (open = true)}>New API key</Button>
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
							<p class="font-medium break-words">{k.name ?? 'Unnamed'}</p><span class="font-mono text-xs text-muted-foreground">{k.start}…</span><p class="mt-1 text-[11px] break-all text-muted-foreground sm:hidden">{showOwner ? k.memberEmail : `Created ${formatDate(k.createdAt, data.timeZone)}`}<br />Last used <When at={k.lastUsedAt} timeZone={data.timeZone} /></p>
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
	<div class="rounded-lg border bg-background p-8 text-center text-muted-foreground">You have no API keys.</div>
{:else}
	{@render keyTable(mine, false)}
{/if}

{#if others.length}
	<h2 class="mt-8 mb-3 text-lg font-medium">Other members’ keys</h2>
	{@render keyTable(others, true)}
{/if}

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
			<Dialog.Header><Dialog.Title>New API key</Dialog.Title></Dialog.Header>
			<form class="space-y-4" onsubmit={create}>
				<div class="space-y-2">
					<Label for="key-name">Name</Label>
					<Input id="key-name" required maxlength={80} placeholder="My laptop agent" bind:value={name} />
				</div>
				{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
				<Dialog.Footer><Button type="submit">Create key</Button></Dialog.Footer>
			</form>
		</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={resultOpen} onOpenChange={(o) => { if (!o) created = null; }}>
	<Dialog.Content class="sm:max-w-2xl">
		{#if created}
			<Dialog.Header>
				<Dialog.Title>Your new API key</Dialog.Title>
				<Dialog.Description>Copy it now; it is shown only once.</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4">
				<div class="flex gap-2">
					<Input readonly value={created.key} aria-label="API key" class="font-mono" />
					<Button variant="outline" onclick={() => created && copy(created.key)}>Copy</Button>
				</div>
				<div class="space-y-1">
					<Label>MCP endpoint</Label><p class="font-mono text-xs break-all">{created.mcpUrl} · Authorization: Bearer &lt;key&gt;</p>
					<Label>REST API</Label>
					<p class="font-mono text-xs break-all">{created.apiUrl} · Authorization: Bearer &lt;key&gt;</p>
				</div>
			</div>
		{/if}
		<Dialog.Footer>
			<Button onclick={() => { resultOpen = false; created = null; }}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
