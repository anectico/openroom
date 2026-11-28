<script lang="ts">
	import { untrack } from 'svelte';
	import BrandingForm from '#lib/admin/BrandingForm.svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { act, attempt } from '#lib/admin/op.ts';
	import SectionHeading from '#lib/admin/SectionHeading.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);

	let retentionDays = $state(untrack(() => data.room.frozenRetentionDays));
	let copyName = $state(untrack(() => `${data.room.name} (copy)`));
	let duplicating = $state(false);

	async function duplicate(event: SubmitEvent) {
		event.preventDefault();
		if (duplicating) return;
		duplicating = true;
		const r = await act<{ id: string }>('duplicate_room', { roomId: room.id, name: copyName }, 'Room duplicated');
		duplicating = false;
		if (r) await goto(`/admin/rooms/${r.id}`);
	}

	let deleteOpen = $state(false);
	let typedName = $state('');
	let deleting = $state(false);
	let deleteError = $state('');
	const nameMatches = $derived(typedName.trim() === room.name.trim());

	async function deleteRoom(event: SubmitEvent) {
		event.preventDefault();
		if (deleting || !nameMatches) return;
		deleting = true;
		deleteError = '';
		const r = await attempt('delete_room', { roomId: room.id, confirm: true }, 'Room deleted');
		deleting = false;
		if (!r.ok) {
			deleteError = r.error;
			return;
		}
		deleteOpen = false;
		await goto('/admin/rooms');
	}

</script>

<svelte:head><title>{room.name} · Settings · OpenRoom</title></svelte:head>

<SectionHeading title="General" description="The room’s appearance, a copy for the next deal, and what happens at the end of it." />

<section class="rounded-xl border bg-card p-4 sm:p-6">
	<div class="mb-6"><h3 class="text-base font-semibold">Room appearance</h3><p class="mt-1 text-sm text-muted-foreground">Make this room feel like yours. Preview your changes before publishing them.</p></div>
	{#key room.id}<BrandingForm roomId={room.id} {room} branding={data.branding} disabled={!canEdit} />{/key}
</section>

{#if data.member?.role !== 'observer'}<div class="mt-6 max-w-2xl rounded-xl border bg-card p-4 sm:p-6">
	<h3 class="font-semibold">Duplicate this room</h3>
	<p class="mb-3 text-sm text-muted-foreground">
		Copies folders, documents (nothing is copied on disk), groups, link defaults, the NDA and branding. Never sharing
		links, investors or activity.
	</p>
	<form class="flex flex-col gap-2 sm:flex-row" onsubmit={duplicate}>
		<Input aria-label="Name of the copy" required maxlength={120} bind:value={copyName} />
		<Button type="submit" variant="outline" disabled={duplicating}>{duplicating ? 'Duplicating…' : 'Duplicate'}</Button>
	</form>
</div>

{/if}
{#if canEdit}
	<div class="mt-6 max-w-2xl rounded-xl border border-destructive/30 bg-card p-4 sm:p-6">
		<h3 class="font-semibold">Freeze this room</h3>
		<p class="mb-4 text-sm text-muted-foreground">
			At the end of a deal: every link is revoked, the room becomes read only for good, and an archive is made with all
			documents, the index, the audit log, the questions and the activity.
		</p>
		<DangerAction
			operation="freeze_room"
			input={{ roomId: room.id }}
			label="Freeze room"
			title="Freeze “{room.name}”?"
			success="Room frozen; the archive is being prepared"
		/>
	</div>
{:else if room.frozenAt && data.member?.role !== 'observer'}
	<form
		class="mt-6 max-w-2xl space-y-2 rounded-xl border bg-card p-4 sm:p-6"
		onsubmit={(e) => {
			e.preventDefault();
			act('set_room_retention', { roomId: room.id, days: retentionDays }, 'Saved');
		}}
	>
		<h3 class="font-semibold">Keep activity and the archive for</h3>
		<div class="flex flex-wrap items-center gap-2">
			<Input type="number" min={30} max={3650} class="w-28" aria-label="Days" bind:value={retentionDays} />
			<span class="text-sm">days after the freeze</span>
			<Button type="submit" variant="outline">Save</Button>
		</div>
		<p class="text-xs text-muted-foreground">NDA acceptances are always kept.</p>
	</form>
{/if}

{#if data.member?.role === 'owner'}
	<div class="mt-6 max-w-2xl rounded-xl border border-destructive/30 bg-card p-4 sm:p-6">
		<h3 class="font-semibold">Delete this room</h3>
		<p class="mb-4 text-sm text-muted-foreground">
			Deletes its folders, documents, sharing links and activity. Investors lose access at once.
		</p>
		<Button variant="destructive" size="sm" onclick={() => { typedName = ''; deleteError = ''; deleteOpen = true; }}>Delete room…</Button>
	</div>
{/if}

<AlertDialog.Root bind:open={() => deleteOpen, (value) => { if (!deleting) deleteOpen = value; }}>
	<AlertDialog.Content>
		<form class="grid gap-4" onsubmit={deleteRoom}>
			<AlertDialog.Header>
				<AlertDialog.Title>Delete “{room.name}”?</AlertDialog.Title>
				<AlertDialog.Description>This deletes {room.fileCount} document{room.fileCount === 1 ? '' : 's'}, every folder, sharing link and all activity, and ends {room.activeLinkCount} active link{room.activeLinkCount === 1 ? '' : 's'}. Investors lose access at once. This cannot be undone.</AlertDialog.Description>
			</AlertDialog.Header>
			<div class="grid gap-2">
				<Label for="delete-room-name">Type the room name to confirm</Label>
				<Input id="delete-room-name" autocomplete="off" spellcheck={false} placeholder={room.name} bind:value={typedName} disabled={deleting} />
			</div>
			{#if deleteError}<p class="text-sm text-destructive" role="alert">{deleteError}</p>{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button" disabled={deleting}>Cancel</AlertDialog.Cancel>
				<Button type="submit" variant="destructive" disabled={deleting || !nameMatches}>{deleting ? 'Deleting…' : 'Delete room'}</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
