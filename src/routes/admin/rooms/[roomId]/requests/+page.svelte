<script lang="ts">
	import { toast } from 'svelte-sonner';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { attempt, formatBytes } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
	let open = $state(false);
	let title = $state('');
	let description = $state('');
	let target = $state('');
	let maxSizeMb = $state(100);
	let due = $state('');
	let error = $state('');

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const [kind, id] = target.split(':');
		const r = await attempt<{ emailed: number }>('create_file_request', {
			roomId: room.id,
			title,
			description,
			target: { kind, id },
			maxSizeMb,
			dueAt: due ? new Date(`${due}T23:59:59`).getTime() : null,
		});
		if (!r.ok) {
			error = r.error;
			return;
		}
		open = false;
		title = description = target = due = '';
		error = '';
		toast.success(r.data.emailed ? `Request created and emailed to ${r.data.emailed}` : 'Request created');
	}
</script>

<svelte:head><title>{room.name} · File requests · OpenRoom</title></svelte:head>

<div class="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
	<p class="text-sm text-muted-foreground">
		Ask investors for a file. Uploads stay outside the room; only members see them, always as downloads.
	</p>
	{#if canEdit}<Button onclick={() => (open = true)}>New request</Button>{/if}
</div>

{#if data.requests.length === 0}
	<div class="rounded-lg border bg-background p-10 text-center text-muted-foreground">No file requests yet.</div>
{:else}
	<ul class="space-y-4">
		{#each data.requests as r (r.id)}
			<li id="request-{r.id}" tabindex="-1" class="scroll-mt-6 rounded-lg border bg-background p-4 target:border-primary target:ring-2 target:ring-ring/30">
				<div class="flex flex-wrap items-start justify-between gap-2">
					<div>
						<p class="font-medium">
							{r.title}
							{#if r.closedAt}<Badge variant="outline">Closed</Badge>{:else if r.overdue}<Badge variant="destructive">Overdue</Badge>{/if}
						</p>
						<p class="text-xs text-muted-foreground">
							For {r.target.kind === 'viewer' ? '' : `${r.target.kind} `}{r.target.label} · up to {formatBytes(r.maxSize)}{r.dueAt
								? ` · due ${new Date(r.dueAt).toISOString().slice(0, 10)}`
								: ''}
						</p>
					</div>
					{#if canEdit && !r.closedAt}
						<DangerAction
							operation="close_file_request"
							input={{ requestId: r.id }}
							label="Close"
							confirmLabel="Close request"
							title="Close this request?"
							success="Request closed"
						/>
					{/if}
				</div>
				{#if r.uploads.length}
					<ul class="mt-3 divide-y border-t text-sm">
						{#each r.uploads as u (u.id)}
							<li class="flex flex-col items-start justify-between gap-2 py-3 sm:flex-row sm:items-center">
								<span class="min-w-0 break-all">
									<a class="underline" href={u.downloadUrl}>{u.name}</a>
									<span class="text-muted-foreground"> · {u.email ?? (u.viewerId ? 'Erased investor' : 'Unknown investor')}{u.email && !u.verified ? ' (unverified)' : ''} · {formatBytes(u.size)}</span>
									{#if u.late}<Badge variant="outline" class="ml-1">Late</Badge>{/if}
								</span>
								<span class="shrink-0 text-xs text-muted-foreground"><When at={u.uploadedAt} timeZone={data.timeZone} /></span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-2 text-sm text-muted-foreground">Nothing uploaded yet.</p>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>New file request</Dialog.Title></Dialog.Header>
		<form class="space-y-3" onsubmit={create}>
			<div class="space-y-1">
				<Label for="fr-title">What to upload</Label>
				<Input id="fr-title" required maxlength={200} placeholder="Signed term sheet" bind:value={title} />
			</div>
			<div class="space-y-1">
				<Label for="fr-desc">Details (optional)</Label>
				<Textarea id="fr-desc" rows={3} maxlength={2000} bind:value={description} />
			</div>
			<div class="space-y-1">
				<Label for="fr-target">From</Label>
				<select id="fr-target" class={selectClass} required bind:value={target}>
					<option value="" disabled>Choose an investor, a link or a group</option>
					{#if data.investors.length}
						<optgroup label="Investors who entered this room">
							{#each data.investors as i (i.viewerId)}<option value="viewer:{i.viewerId}">{i.email}</option>{/each}
						</optgroup>
					{/if}
					{#if data.links.length}
						<optgroup label="Everyone on a link">
							{#each data.links as l (l.id)}<option value="link:{l.id}">{l.label}</option>{/each}
						</optgroup>
					{/if}
					{#if data.groups.length}
						<optgroup label="Everyone in a group">
							{#each data.groups as g (g.id)}<option value="group:{g.id}">{g.name}</option>{/each}
						</optgroup>
					{/if}
				</select>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="fr-size">Largest file (MB)</Label>
					<Input id="fr-size" type="number" min={1} max={10240} bind:value={maxSizeMb} />
				</div>
				<div class="space-y-1">
					<Label for="fr-due">Due (optional)</Label>
					<Input id="fr-due" type="date" bind:value={due} />
				</div>
			</div>
			<p class="text-xs text-muted-foreground">
				{data.emailReady ? 'Verified investors are emailed the request.' : 'Email is not set up, so investors see it next time they open the room.'}
			</p>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<Dialog.Footer><Button type="submit">Create request</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
