<script lang="ts">
	import { parseDate, today } from '@internationalized/date';
	import { CircleX, Download, FileUp, Inbox, Link2, Plus } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import { attempt, formatBytes } from '#lib/admin/op.ts';
	import SectionHeading from '#lib/admin/SectionHeading.svelte';
	import When from '#lib/admin/When.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	const hasTargets = $derived(data.investors.length + data.links.length + data.groups.length > 0);
	let open = $state(false);
	let saving = $state(false);
	let title = $state('');
	let description = $state('');
	let target = $state('');
	let maxSizeMb = $state(100);
	let due = $state('');
	let error = $state('');

	function newRequest() {
		title = description = target = due = error = '';
		maxSizeMb = 100;
		open = true;
	}

	let closing = $state<{ id: string; title: string } | null>(null);
	let closeBusy = $state(false);
	async function closeRequest() {
		if (!closing || closeBusy) return;
		closeBusy = true;
		const r = await attempt('close_file_request', { requestId: closing.id, confirm: true }, 'Request closed');
		closeBusy = false;
		if (r.ok) closing = null;
		else toast.error(r.error);
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (saving || !target) return;
		saving = true;
		const [kind, id] = target.split(':');
		const r = await attempt<{ emailed: number }>('create_file_request', {
			roomId: room.id,
			title,
			description,
			target: { kind, id },
			maxSizeMb,
			dueAt: due ? parseDate(due).add({ days: 1 }).toDate(data.timeZone).getTime() - 1 : null,
		});
		saving = false;
		if (!r.ok) {
			error = r.error;
			return;
		}
		open = false;
		toast.success(r.data.emailed ? `Request created and emailed to ${r.data.emailed}` : 'Request created');
	}
</script>

<svelte:head><title>{room.name} · File requests · OpenRoom</title></svelte:head>

<SectionHeading title="File requests" description="Collect files from investors. Only workspace members can download submissions.">
	{#snippet actions()}{#if canEdit && hasTargets && data.requests.length}<Button onclick={newRequest}><Plus />New request</Button>{/if}{/snippet}
</SectionHeading>

{#if !hasTargets && canEdit && data.requests.length}
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5">
		<div><p class="font-medium">Choose who can upload</p><p class="mt-1 text-sm text-muted-foreground">Create a sharing link or an investor group to choose a recipient.</p></div>
		<Button variant="outline" href="/admin/rooms/{room.id}/links?new=1"><Link2 />Create a sharing link</Button>
	</div>
{/if}
{#if !data.requests.length}
	<div class="grid justify-items-center gap-2 rounded-xl border bg-card px-5 py-10 text-center">
		<span class="mb-1 grid size-11 place-items-center rounded-xl bg-muted"><Inbox class="size-5 text-muted-foreground" /></span>
		<h3 class="font-medium">No file requests yet</h3>
		<p class="max-w-sm text-sm text-muted-foreground">{canEdit && !hasTargets ? 'Create a sharing link or an investor group to choose who can upload.' : 'Track requested documents and download the files investors submit here.'}</p>
		{#if canEdit && hasTargets}<Button class="mt-2" onclick={newRequest}><Plus />New request</Button>
		{:else if canEdit}<Button class="mt-2" variant="outline" href="/admin/rooms/{room.id}/links?new=1"><Link2 />Create a sharing link</Button>{/if}
	</div>
{:else}
	<ul class="grid gap-4">
		{#each data.requests as r (r.id)}
			<li id="request-{r.id}" tabindex="-1" class="min-w-0 scroll-mt-6 overflow-hidden rounded-xl border bg-card target:border-primary target:ring-2 target:ring-ring/30">
				<div class="space-y-3 px-4 py-4 sm:px-5">
					<div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
						<div class="min-w-0">
							<h3 class="font-semibold [overflow-wrap:anywhere]">{r.title}</h3>
							<Badge class="mt-1.5" variant={r.closedAt ? 'outline' : r.overdue ? 'destructive' : 'secondary'}>{r.closedAt ? 'Closed' : r.overdue ? 'Overdue' : 'Open'}</Badge>
						</div>
						{#if canEdit && !r.closedAt}
							<Button variant="outline" size="sm" onclick={() => (closing = { id: r.id, title: r.title })}><CircleX aria-hidden="true" />Close</Button>
						{/if}
					</div>
					{#if r.description}<p class="whitespace-pre-line text-sm [overflow-wrap:anywhere]">{r.description}</p>{/if}
					<dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-[minmax(0,2fr)_1fr_1fr]">
						<div class="max-sm:col-span-2"><dt class="text-xs text-muted-foreground">{r.target.kind === 'viewer' ? 'Investor' : r.target.kind === 'group' ? 'Investor group' : 'Sharing link'}</dt><dd class="mt-1 [overflow-wrap:anywhere]">{r.target.label}</dd></div>
						<div><dt class="text-xs text-muted-foreground">File limit</dt><dd class="mt-1">{formatBytes(r.maxSize)}</dd></div>
						<div><dt class="text-xs text-muted-foreground">Due date</dt><dd class="mt-1">{r.dueAt ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: data.timeZone }).format(r.dueAt) : 'No deadline'}</dd></div>
					</dl>
				</div>
				<div class="border-t bg-muted/25 px-4 py-3 sm:px-5">
					<h4 class="flex items-center gap-2 text-sm font-medium"><FileUp class="size-4 text-muted-foreground" />Submissions <span class="text-xs tabular-nums text-muted-foreground">{r.uploads.length}</span></h4>
					{#if r.uploads.length}
						<ul class="mt-1 divide-y">
							{#each r.uploads as u (u.id)}
								<li class="flex flex-wrap items-center justify-between gap-2 py-2">
									<div class="min-w-0">
										<a class="inline-flex max-w-full items-center gap-2 text-sm font-medium hover:underline" href={u.downloadUrl}><Download class="size-4 shrink-0" /><span class="[overflow-wrap:anywhere]">{u.name}</span></a>
										<p class="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{u.email ?? (u.viewerId ? 'Erased investor' : 'Unknown investor')} · {formatBytes(u.size)}</p>
									</div>
									<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										{#if u.email && !u.verified}<Badge variant="outline">Unverified</Badge>{/if}
										{#if u.late}<Badge variant="outline">Late</Badge>{/if}
										<When at={u.uploadedAt} timeZone={data.timeZone} />
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

<Dialog.Root bind:open={() => open, (value) => { if (!saving) open = value; }}>
	<Dialog.Content class="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
		<Dialog.Header class="shrink-0 border-b px-5 py-4 pr-14"><Dialog.Title>New file request</Dialog.Title><Dialog.Description>Choose what to collect and who can upload it.</Dialog.Description></Dialog.Header>
		<form class="flex min-h-0 flex-col" onsubmit={create}>
			<fieldset disabled={saving} class="min-w-0 space-y-4 overflow-y-auto p-5">
				<div class="space-y-1">
					<Label for="fr-title">What to upload</Label>
					<Input id="fr-title" required minlength={2} maxlength={200} placeholder="Signed term sheet" bind:value={title} />
				</div>
				<div class="space-y-1">
					<Label for="fr-desc">Details (optional)</Label>
					<Textarea id="fr-desc" rows={3} maxlength={2000} bind:value={description} />
				</div>
				<div class="space-y-1">
					<Label for="fr-target">From</Label>
					<ChoiceSelect id="fr-target" name="target" class="w-full" required bind:value={target}
						placeholder="Choose an investor, a link or a group"
						groups={[
							{ label: 'Investors who entered this room', options: data.investors.map((i) => ({ value: `viewer:${i.viewerId}`, label: i.email ?? 'Unknown investor' })) },
							{ label: 'Everyone on a link', options: data.links.map((l) => ({ value: `link:${l.id}`, label: l.label })) },
							{ label: 'Everyone in a group', options: data.groups.map((g) => ({ value: `group:${g.id}`, label: g.name })) },
						]}
					/>
				</div>
				<div class="grid gap-3 min-[400px]:grid-cols-2">
					<div class="space-y-1">
						<Label for="fr-size">Largest file (MB)</Label>
						<Input id="fr-size" required type="number" min={1} max={10240} bind:value={maxSizeMb} />
					</div>
					<div class="space-y-1">
						<Label for="fr-due">Due (optional)</Label>
						<Input id="fr-due" type="date" min={today(data.timeZone).toString()} bind:value={due} />
						<p class="text-xs text-muted-foreground">End of day in {data.timeZone}.</p>
					</div>
				</div>
				<p class="text-xs text-muted-foreground">
					{data.emailReady ? 'Verified investors are emailed the request.' : 'Email is not set up, so investors see it next time they open the room.'}
				</p>
				{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			</fieldset>
			<Dialog.Footer class="shrink-0 flex-row justify-end border-t px-5 py-3">
				<Button variant="outline" disabled={saving} onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={!target || saving}><Plus />{saving ? 'Creating…' : 'Create request'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={!!closing} onOpenChange={(value) => { if (!value && !closeBusy) closing = null; }}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Close “{closing?.title}”?</AlertDialog.Title>
			<AlertDialog.Description>Investors can no longer upload to this request. Files already submitted stay here.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={closeBusy}>Keep open</AlertDialog.Cancel>
			<Button variant="outline" disabled={closeBusy} onclick={closeRequest}>{closeBusy ? 'Closing…' : 'Close request'}</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
