<script lang="ts">
	import { untrack } from 'svelte';
	import BrandingForm from '#lib/admin/BrandingForm.svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { act } from '#lib/admin/op.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);

	let retentionDays = $state(untrack(() => data.room.frozenRetentionDays));
	let copyName = $state(untrack(() => `${data.room.name} (copy)`));

	async function duplicate(event: SubmitEvent) {
		event.preventDefault();
		const r = await act<{ id: string }>('duplicate_room', { roomId: room.id, name: copyName }, 'Room duplicated');
		if (r) await goto(`/admin/rooms/${r.id}`);
	}

</script>

<svelte:head><title>{room.name} · Settings · OpenRoom</title></svelte:head>

<section class="rounded-xl border bg-card p-4 sm:p-6">
	<div class="mb-6"><h2 class="text-lg font-semibold">Room appearance</h2><p class="mt-1 text-sm text-muted-foreground">Make this room feel like yours. Preview your changes before publishing them.</p></div>
	{#key room.id}<BrandingForm roomId={room.id} {room} branding={data.branding} disabled={!canEdit} />{/key}
</section>

{#if data.member?.role !== 'observer'}<div class="mt-6 max-w-2xl rounded-lg border bg-background p-6">
	<h2 class="font-medium">Duplicate this room</h2>
	<p class="mb-3 text-sm text-muted-foreground">
		Copies folders, files (nothing is copied on disk), groups, link defaults, the NDA and branding. Never links, investors
		or activity.
	</p>
	<form class="flex flex-col gap-2 sm:flex-row" onsubmit={duplicate}>
		<Input aria-label="Name of the copy" required maxlength={120} bind:value={copyName} />
		<Button type="submit" variant="outline">Duplicate</Button>
	</form>
</div>

{/if}
{#if canEdit}
	<div class="mt-6 max-w-2xl rounded-lg border border-destructive/30 bg-background p-6">
		<h2 class="font-medium">Freeze this room</h2>
		<p class="mb-4 text-sm text-muted-foreground">
			At the end of a deal: every link is revoked, the room becomes read only for good, and an archive is made with all
			files, the index, the audit log, the questions and the activity.
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
		class="mt-6 max-w-2xl space-y-2 rounded-lg border bg-background p-6"
		onsubmit={(e) => {
			e.preventDefault();
			act('set_room_retention', { roomId: room.id, days: retentionDays }, 'Saved');
		}}
	>
		<h2 class="font-medium">Keep activity and the archive for</h2>
		<div class="flex flex-wrap items-center gap-2">
			<Input type="number" min={30} max={3650} class="w-28" aria-label="Days" bind:value={retentionDays} />
			<span class="text-sm">days after the freeze</span>
			<Button type="submit" variant="outline">Save</Button>
		</div>
		<p class="text-xs text-muted-foreground">NDA acceptances are always kept.</p>
	</form>
{/if}

{#if data.member?.role === 'owner'}
	<div class="mt-6 max-w-2xl rounded-lg border border-destructive/30 bg-background p-6">
		<h2 class="font-medium">Delete this room</h2>
		<p class="mb-4 text-sm text-muted-foreground">
			Deletes its folders, files, links and activity. Investors lose access at once.
		</p>
		<DangerAction
			operation="delete_room"
			input={{ roomId: room.id }}
			label="Delete room"
			title="Delete “{room.name}”?"
			success="Room deleted"
			onDone={() => goto('/admin/rooms')}
		/>
	</div>
{/if}
