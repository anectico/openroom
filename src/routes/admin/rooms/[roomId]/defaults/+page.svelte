<script lang="ts">
	import { untrack } from 'svelte';
	import { act } from '#lib/admin/op.ts';
	import type { LinkSettings } from '#lib/admin/types.ts';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	let s = $state<LinkSettings>(untrack(() => structuredClone($state.snapshot(data.room.linkDefaults))));
	let busy = $state(false);

	const toggles = [
		{ key: 'verifyEmail', label: 'Email verification', hint: 'Investors confirm their email with a code. Needs email.' },
		{ key: 'requireNda', label: 'NDA', hint: 'Investors accept the room’s NDA before entering.' },
		{ key: 'watermark', label: 'Watermark', hint: 'Pages show the investor’s email, the time and their IP.' },
		{
			key: 'screenshotProtection',
			label: 'Screenshot protection',
			hint: 'Best effort: blurs when the window loses focus and blocks printing.',
		},
		{ key: 'notifyEveryView', label: 'Notify me on every view', hint: 'Not only the first visit.' },
	] as const;
	const selectClass =
		'h-9 w-40 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 outline-none sm:w-64';

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		await act(
			'update_link_defaults',
			{ roomId: room.id, settings: { ...s, customFields: s.customFields.filter((f) => f.label.trim()) } },
			'Link defaults saved',
		);
		busy = false;
	}
</script>

<svelte:head><title>{room.name} · Link defaults · OpenRoom</title></svelte:head>

<form class="max-w-2xl space-y-6 rounded-xl border bg-card p-5 sm:p-6" onsubmit={save}>
	<h2 class="text-sm font-semibold">Default link protection</h2>
	<p class="text-sm text-muted-foreground">
		New and existing links follow these settings unless a link overrides one.
	</p>
	{#each toggles as t (t.key)}
		<div class="flex items-start justify-between gap-4">
			<div>
				<Label for="d-{t.key}"
					>{t.label}
					{#if t.key === 'verifyEmail' && !data.emailReady}
						{#if data.member?.role === 'owner'}<a href="/admin/settings#email"><Badge variant="outline">Needs email</Badge></a>
						{:else}<Badge variant="outline" title="Ask an owner to set up email">Needs email</Badge>{/if}
					{/if}</Label
				>
				<p class="text-xs text-muted-foreground">{t.hint}</p>
			</div>
			<Switch
				id="d-{t.key}"
				bind:checked={s[t.key]}
				disabled={!canEdit ||
					(t.key === 'requireNda' && !room.hasNda && !s.requireNda) ||
					(t.key === 'verifyEmail' && !data.emailReady && !s.verifyEmail)}
			/>
		</div>
	{/each}
	{#if !room.hasNda}<p class="text-xs text-muted-foreground">An NDA can be required once the room has NDA text.</p>{/if}
	{#if s.verifyEmail && !data.emailReady}
		<p class="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
			Email is not set up, so codes can't be sent: investors can't enter through links that follow this default
			until email is set up or verification is turned off.
		</p>
	{/if}
	<div class="flex items-center justify-between gap-4">
		<Label for="d-downloads">Downloads</Label>
		<select id="d-downloads" class={selectClass} bind:value={s.downloads} disabled={!canEdit}>
			<option value="none">No downloads</option>
			<option value="per_file">Each file</option>
			<option value="zip">All allowed files as one zip</option>
		</select>
	</div>
	<div class="flex items-center justify-between gap-4">
		<div>
			<Label for="d-read">Counts as read after</Label>
			<p class="text-xs text-muted-foreground">Share of a file’s pages viewed.</p>
		</div>
		<div class="flex items-center gap-2">
			<Input
				id="d-read"
				type="number"
				min={10}
				max={100}
				class="w-20"
				value={Math.round(s.readPastShare * 100)}
				oninput={(e) => (s.readPastShare = Number((e.currentTarget as HTMLInputElement).value) / 100)}
				disabled={!canEdit}
			/>
			<span class="text-sm">%</span>
		</div>
	</div>
	<div class="space-y-2">
		<Label>Questions before viewing</Label>
		<p class="text-xs text-muted-foreground">Such as company or fund. Up to 5.</p>
		{#each s.customFields as field, i (i)}
			<div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
				<Input aria-label="Question {i + 1}" maxlength={60} bind:value={field.label} disabled={!canEdit} />
				<label class="flex items-center gap-1 text-sm whitespace-nowrap">
					<input type="checkbox" bind:checked={field.required} disabled={!canEdit} /> Required
				</label>
				<Button variant="ghost" size="sm" onclick={() => s.customFields.splice(i, 1)} disabled={!canEdit}>Remove</Button>
			</div>
		{/each}
		{#if canEdit && s.customFields.length < 5}
			<Button variant="outline" size="sm" onclick={() => s.customFields.push({ label: '', required: true })}
				>Add a question</Button
			>
		{/if}
	</div>
	{#if canEdit}<Button type="submit" disabled={busy}>Save defaults</Button>{/if}
</form>
