<script lang="ts">
	import { Activity, ArrowUpRight, FileQuestion, Files, Plus, ShieldCheck, Trash2 } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import { attempt } from '#lib/admin/op.ts';
	import type { LinkSettings } from '#lib/admin/types.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	let saved = $state(untrack(() => $state.snapshot(data.room.linkDefaults)));
	let draft = $state<LinkSettings>(untrack(() => $state.snapshot(saved)));
	const asPercent = (share: number) => Number((share * 100).toFixed(10));
	let percent = $state<number | undefined>(untrack(() => asPercent(saved.readPastShare)));
	let busy = $state(false);
	let error = $state('');
	let setupOpened = false;
	const changed = $derived(JSON.stringify(draft) !== JSON.stringify(saved) || percent !== asPercent(saved.readPastShare));
	type Toggle = 'verifyEmail' | 'requireNda' | 'watermark' | 'screenshotProtection' | 'notifyEveryView';

	function reset(settings: LinkSettings) {
		saved = $state.snapshot(settings);
		draft = $state.snapshot(settings);
		percent = asPercent(settings.readPastShare);
		error = '';
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !canEdit || !changed || percent === undefined) return;
		busy = true;
		const settings = $state.snapshot(draft);
		if (percent !== asPercent(saved.readPastShare)) settings.readPastShare = percent / 100;
		const updates = Object.fromEntries(Object.entries(settings).filter(([key, value]) =>
			JSON.stringify(value) !== JSON.stringify(saved[key as keyof LinkSettings])));
		const r = await attempt<{ linkDefaults: LinkSettings }>('update_link_defaults', { roomId: room.id, settings: updates }, 'Link defaults saved');
		if (r.ok) reset(r.data.linkDefaults);
		else error = r.error;
		busy = false;
	}

	async function addQuestion() {
		if (draft.customFields.length >= 5) return;
		draft.customFields.push({ label: '', required: true });
		await tick();
		document.getElementById(`entry-question-${draft.customFields.length}`)?.focus();
	}

	async function refreshSetup() {
		if (!setupOpened) return;
		setupOpened = false;
		await invalidateAll();
	}
</script>

<svelte:window onfocus={refreshSetup} />
<svelte:head><title>{room.name} · Link defaults · OpenRoom</title></svelte:head>

{#snippet heading(title: string, Icon: typeof ShieldCheck)}
	<h3 class="flex items-center gap-2.5 border-b bg-muted/20 px-5 py-4 text-base font-semibold"><Icon aria-hidden="true" class="size-4 text-primary" />{title}</h3>
{/snippet}

{#snippet toggle(key: Toggle, label: string, hint: string, blocked = false)}
	<div class="flex items-center justify-between gap-4">
		<div class="min-w-0">
			<Label for={`d-${key}`}>{label}</Label>
			<p id={`hint-${key}`} class="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
		</div>
		<Switch id={`d-${key}`} aria-describedby={`hint-${key}`} bind:checked={draft[key]} disabled={!canEdit || busy || blocked} />
	</div>
{/snippet}

<header class="mb-5">
	<h2 class="text-xl font-semibold tracking-tight">Default link protection</h2>
	<p class="mt-1 text-sm leading-relaxed text-muted-foreground">New and existing sharing links inherit these settings. Each link can override individual defaults.</p>
</header>

<form onsubmit={save} class="min-w-0">
	<div class="grid items-start gap-4 xl:grid-cols-2">
		<div class="grid min-w-0 gap-4">
			<section class="overflow-hidden rounded-xl border bg-card">
				{@render heading('Investor access', ShieldCheck)}
				<div class="divide-y px-5">
					<div class="py-4">
						{@render toggle('verifyEmail', 'Email verification', 'Ask investors to confirm their email address with a code.', !data.emailReady && !draft.verifyEmail)}
						{#if !data.emailReady}
							<div class="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed">
								<p>{draft.verifyEmail ? 'Investors cannot enter links that inherit this setting until email delivery is configured or verification is turned off.' : 'Email verification needs an email provider.'}</p>
								{#if data.member?.role === 'owner'}<a class="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline" href="/admin/settings#email" target="_blank" rel="noreferrer" onclick={() => (setupOpened = true)}>Set up email provider <ArrowUpRight aria-hidden="true" class="size-3.5" /></a>
								{:else}<p class="text-muted-foreground">A workspace owner can configure email delivery in Settings.</p>{/if}
							</div>
						{/if}
					</div>
					<div class="py-4">
						{@render toggle('requireNda', 'Require an NDA', 'Investors accept the room’s agreement before entering.', !room.hasNda && !draft.requireNda)}
						{#if !room.hasNda}
							<p class="mt-2 text-xs leading-relaxed text-muted-foreground">Publish the room’s NDA to enable this setting.
								{#if canEdit}<a class="inline-flex items-center gap-1 font-medium text-primary hover:underline" href="/admin/rooms/{room.id}/nda" target="_blank" rel="noreferrer" onclick={() => (setupOpened = true)}>Set up NDA <ArrowUpRight aria-hidden="true" class="size-3.5" /></a>{/if}
							</p>
						{/if}
					</div>
				</div>
			</section>

			<section class="overflow-hidden rounded-xl border bg-card">
				{@render heading('Questions before viewing', FileQuestion)}
				<div class="grid gap-4 p-5">
					<p class="text-sm text-muted-foreground">Ask investors up to five questions when they enter, such as which fund they represent.</p>
					{#each draft.customFields as field, i (i)}
						<div class="grid gap-2 rounded-lg border bg-muted/20 p-3">
							<Label for={`entry-question-${i + 1}`}>Question {i + 1}</Label>
							<Input id={`entry-question-${i + 1}`} placeholder="e.g. Which fund do you represent?" required pattern={'.*\\S.*'} maxlength={60} bind:value={field.label} disabled={!canEdit || busy} />
							<div class="flex items-center justify-between gap-3">
								<label class="flex items-center gap-2 text-xs"><input type="checkbox" class="size-4 accent-primary" bind:checked={field.required} disabled={!canEdit || busy} />Required</label>
								{#if canEdit}<Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove question ${i + 1}`} onclick={() => draft.customFields.splice(i, 1)}><Trash2 />Remove</Button>{/if}
							</div>
						</div>
					{/each}
					<div class="flex flex-wrap items-center justify-between gap-2">
						{#if canEdit}<Button variant="outline" disabled={busy || draft.customFields.length >= 5} onclick={addQuestion}><Plus />Add a question</Button>{/if}
						<span class="text-xs tabular-nums text-muted-foreground">{draft.customFields.length} of 5 questions</span>
					</div>
				</div>
			</section>
		</div>

		<div class="grid min-w-0 gap-4">
			<section class="overflow-hidden rounded-xl border bg-card">
				{@render heading('Document protection', Files)}
				<div class="divide-y px-5">
					<div class="py-4">{@render toggle('watermark', 'Watermark', 'Show the investor’s email, IP address and viewing time on document pages.')}</div>
					<div class="py-4">{@render toggle('screenshotProtection', 'Screenshot protection', 'Blur the viewer when it loses focus and block printing. Screenshots may still be possible.')}</div>
					<div class="grid gap-2 py-4">
						<Label for="d-downloads">Downloads</Label>
						<ChoiceSelect id="d-downloads" class="w-full" bind:value={draft.downloads} disabled={!canEdit || busy}
							options={[{ value: 'none', label: 'No downloads' }, { value: 'per_file', label: 'Individual files' }, { value: 'zip', label: 'All allowed files as one ZIP' }]} />
						<p class="text-xs leading-relaxed text-muted-foreground">Download-only files can always be downloaded by investors who have access.</p>
					</div>
				</div>
			</section>

			<section class="overflow-hidden rounded-xl border bg-card">
				{@render heading('Activity tracking', Activity)}
				<div class="divide-y px-5">
					<div class="flex items-center justify-between gap-4 py-4">
						<div><Label for="d-read">Reading threshold</Label><p id="threshold-help" class="mt-1 text-xs leading-relaxed text-muted-foreground">Percentage of pages viewed or video watched to count as read.</p></div>
						<div class="relative w-24 shrink-0"><Input id="d-read" type="number" required min={10} max={100} step="any" aria-describedby="threshold-help" class="pr-8" bind:value={percent} disabled={!canEdit || busy} /><span aria-hidden="true" class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span></div>
					</div>
					<div class="py-4">{@render toggle('notifyEveryView', 'Notify on every visit', 'Send a notification each time an investor enters the room.')}</div>
				</div>
			</section>
		</div>
	</div>
	{#if canEdit}
		<footer class="mt-5 flex flex-wrap items-center justify-end gap-3 border-t py-4">
			{#if error}<p role="alert" class="w-full text-sm text-destructive">{error}</p>{/if}
			{#if changed}<span class="mr-auto text-xs text-muted-foreground">Unsaved changes</span><Button variant="ghost" disabled={busy} onclick={() => reset(room.linkDefaults)}>Discard</Button>{/if}
			<Button type="submit" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save defaults'}</Button>
		</footer>
	{/if}
</form>
