<script lang="ts">
	import { ArrowRight, ArrowUpRight, ChevronDown, Copy, Eye, Mail } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
 import * as Alert from '#lib/components/ui/alert/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { renderMarkdown } from '#lib/markdown.ts';
import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { copyText, formatDate, op } from './op.ts';
	import { openPreview } from './preview.ts';
	import type { Link, LinkSettings } from './types.ts';

	let {
		open = $bindable(false),
		roomId,
		defaults,
		hasNda,
		link = null,
		emailReady,
		isOwner,
		timeZone = 'UTC',
		groups,
	}: {
		open?: boolean;
		roomId: string;
		defaults: LinkSettings;
		hasNda: boolean;
		link?: Link | null;
		emailReady: boolean;
		isOwner: boolean;
		timeZone?: string;
		groups: { id: string; name: string }[];
	} = $props();

	type Choice = 'room' | 'on' | 'off';
	const toggles = [
		{ key: 'verifyEmail', label: 'Email verification' },
		{ key: 'requireNda', label: 'NDA' },
		{ key: 'watermark', label: 'Watermark' },
		{ key: 'screenshotProtection', label: 'Screenshot protection' },
		{ key: 'notifyEveryView', label: 'Notify me on every view' },
	] as const;
	const selectClass =
		'h-11 sm:h-9 w-40 min-w-0 shrink rounded-md sm:w-52 border border-input bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';
	const downloadLabels = { none: 'No downloads', per_file: 'Each file', zip: 'All allowed files as one zip' };

	let label = $state('');
	let welcome = $state('');
 let welcomePane = $state('edit');
	const welcomeHtml = $derived(renderMarkdown(welcome));
	let isOpen = $state(false);
	let allow = $state('');
	let blocks = $state('');
	let password = $state('');
	let removePassword = $state(false);
	let expires = $state('');
	let initialExpires = $state('');
	let choices = $state<Record<string, Choice>>({});
	let downloads = $state<'room' | LinkSettings['downloads']>('room');
	let groupId = $state('');
	let busy = $state(false);
	let error = $state('');
 let created = $state<Link | null>(null);
 let discardOpen = $state(false);
 let discardConfirmed = false;
 let initialDraft = $state('');
 const draft = $derived(JSON.stringify({ label, welcome, isOpen, allow, blocks, password, removePassword, expires, choices, downloads, groupId }));
 const dirty = $derived(!created && draft !== initialDraft);
 function requestOpen(value: boolean) {
  if (!value && (busy || sendingInvite)) return;
  if (!value && dirty) { discardOpen = true; return; }
  open = value;
 }
 beforeNavigate((navigation) => {
  if (open && dirty && !navigation.willUnload && !window.confirm('Discard your unsaved sharing link changes?')) navigation.cancel();
 });

	let copyButton = $state<HTMLButtonElement | null>(null);
	let availableGroups = $state<{ id: string; name: string }[]>([]);
	let refreshingGroups = $state(false);
	let groupError = $state('');
	let invitation = $state('');
	let invitationSent = $state(false);
	let sendingInvite = $state(false);
	const individualEmails = $derived(created?.allow.filter((entry) => entry.kind === 'email') ?? []);

	let openedEmailSetup = false;
	async function refreshEmailSetup() {
		if (!open || !openedEmailSetup) return;
		await invalidateAll().catch(() => {});
		if (emailReady) openedEmailSetup = false;
	}

	async function refreshGroups() {
		if (refreshingGroups) return;
		refreshingGroups = true;
		groupError = '';
		try {
			const result = await op<{ groups: typeof availableGroups }>('list_groups', { roomId });
			availableGroups = result.groups;
		} catch { groupError = 'Could not refresh groups. Your draft is still here. Try again.'; }
		finally { refreshingGroups = false; }
	}

	async function sendInvitation() {
		if (!created || sendingInvite || invitationSent) return;
		sendingInvite = true;
		error = '';
		try {
			const result = await op<{ sent: number; skipped: string[] }>('send_link_invites', { linkId: created.id });
			invitationSent = result.sent > 0;
			invitation = `${result.sent} invitation${result.sent === 1 ? '' : 's'} queued for email.${result.skipped.length ? ` Could not queue: ${result.skipped.join(', ')}. You can copy the link instead.` : ''}`;
		} catch (e) { error = e instanceof Error ? e.message : 'Could not send the invitation. Copy the link or try again.'; }
		finally { sendingInvite = false; }
	}


	$effect(() => {
		if (!open) return;
		untrack(() => {
			created = null;
			openedEmailSetup = false;
			invitation = '';
			invitationSent = false;
			availableGroups = groups;
			groupError = '';
			label = link?.label ?? '';
			welcome = link?.welcomeMarkdown ?? '';
 welcomePane = 'edit';
			isOpen = link?.open ?? false;
			allow = link?.allow.map((e) => e.value).join('\n') ?? '';
			blocks = link?.blocks.map((e) => e.value).join('\n') ?? '';
			password = '';
			removePassword = false;
			const start = link?.expiresAt ? localDate(link.expiresAt) : '';
			expires = start;
			initialExpires = start;
			const next: Record<string, Choice> = {};
			for (const t of toggles)
				next[t.key] = link?.overridden.includes(t.key) ? (link.settings[t.key] ? 'on' : 'off') : 'room';
			choices = next;
			downloads = link?.overridden.includes('downloads') ? link.settings.downloads : 'room';
			groupId = link?.groupId ?? '';
			error = '';
 initialDraft = JSON.stringify({ label, welcome, isOpen, allow, blocks, password, removePassword, expires, choices, downloads, groupId });
 discardOpen = false;
		});
	});

	function localDate(ms: number) {
		const d = new Date(ms);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	const lines = (text: string) =>
		text
			.split(/[\n,;]+/)
			.map((s) => s.trim())
			.filter(Boolean);

	const effective = (key: (typeof toggles)[number]['key']) =>
		choices[key] === 'room' ? defaults[key] : choices[key] === 'on';

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (groupId && !availableGroups.some((group) => group.id === groupId)) { error = 'This group is no longer available. Select a document group before saving.'; return; }
		busy = true;
		error = '';
		const settings: Record<string, unknown> = {};
		const resetSettings: string[] = [];
		for (const t of toggles) {
			if (choices[t.key] === 'room') resetSettings.push(t.key);
			else settings[t.key] = choices[t.key] === 'on';
		}
		if (downloads === 'room') resetSettings.push('downloads');
		else settings.downloads = downloads;
		const body: Record<string, unknown> = { welcomeMarkdown: welcome.trim() || null, label, open: isOpen, blocks: lines(blocks), settings, groupId: groupId || null };
		if (!isOpen) body.allow = lines(allow);
		if (!link || expires !== initialExpires)
			body.expiresAt = expires ? new Date(`${expires}T23:59:59`).getTime() : null;
		if (password) body.password = password;
		else if (removePassword) body.password = null;
		try {
			const saved = link
				? await op<Link>('update_link', { linkId: link.id, ...body, resetSettings })
				: await op<Link>('create_link', { roomId, ...body });
			if (!saved?.id) throw new Error('Your session may have ended. Sign in again, then retry.');
			if (link) open = false;
			else {
				created = saved;
				await tick();
				copyButton?.focus();
			}
			await invalidateAll().catch(() => {});
		} catch (e) { error = e instanceof Error ? e.message : 'Could not save the link. Try again.'; }
		finally { busy = false; }
	}
</script>

{#snippet verificationHelp(verified: boolean, anyEmail: boolean)}
	{#if !emailReady}
		<Alert.Root variant={verified ? 'destructive' : 'default'} class="bg-muted/40">
			<Mail aria-hidden="true" />
			<Alert.Title>{verified ? 'Investors cannot receive a verification code' : 'Email verification needs an email provider'}</Alert.Title>
			<Alert.Description class="[&_p:not(:last-child)]:mb-1">
				{#if verified}
					This link requires a code. Investors cannot enter until email delivery is configured or verification is turned off.
				{:else}
					{anyEmail ? 'Visitors can enter an email address without proving they own it.' : 'Visitors can enter an allowed email address without proving they own it.'}
				{/if}
				{#if isOwner}
					{#if !verified}<p>{created ? 'To require a code, connect a provider and edit this link.' : 'Connect a provider, then choose On to require a code.'}</p>{/if}
					<a href="/admin/settings#email" target="_blank" rel="noopener noreferrer" class="flex w-fit items-center gap-1 font-medium text-foreground" onclick={() => (openedEmailSetup = true)}>Set up email provider <ArrowUpRight class="size-3.5" /><span class="sr-only">(opens in a new tab)</span></a>
				{:else}
					Ask a workspace owner to connect an email provider in Settings.
				{/if}
			</Alert.Description>
		</Alert.Root>
	{:else if verified}
		<p class="text-xs text-muted-foreground">Investors must enter the code sent to their email address.</p>
	{:else}
		<p class="text-xs text-muted-foreground">{anyEmail ? 'Visitors can enter an email address without proving they own it.' : 'Visitors can enter an allowed email address without proving they own it.'}</p>
	{/if}
{/snippet}

<svelte:window onfocus={refreshEmailSetup} onbeforeunload={(event) => { if (open && dirty) event.preventDefault(); }} />
<Dialog.Root bind:open={() => open, requestOpen}>
	<Dialog.Content class="grid transition-none max-sm:inset-0 max-sm:h-full max-sm:max-h-full max-sm:max-w-full max-sm:translate-none max-sm:rounded-none sm:max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[620px]">
		<Dialog.Header class="border-b px-5 py-4 pr-14 sm:px-6 sm:py-5 sm:pr-16"><Dialog.Title>{created ? 'Sharing link created' : link ? 'Edit sharing link' : 'Create a sharing link'}</Dialog.Title><Dialog.Description>{created ? 'Review access, then copy the link or send an invitation.' : 'Choose who can enter and which documents they can see.'}</Dialog.Description></Dialog.Header>
		{#if created}
			<div class="flex min-h-0 flex-col">
				<div class="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-5">
					<Field.Field><Field.Label for="created-link">{created.label}</Field.Label><Input id="created-link" readonly value={created.url} onclick={(event) => event.currentTarget.select()} /></Field.Field>
					<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
						<dt class="text-muted-foreground">Audience</dt><dd class="break-words">{created.open ? 'Anyone with the link who enters an email' : created.allow.map((entry) => entry.value).join(', ') || 'No allowed emails'}</dd>
						<dt class="text-muted-foreground">Welcome</dt><dd>{created.welcomeMarkdown ? 'Personal note after access checks' : 'Room introduction'}</dd>
						<dt class="text-muted-foreground">Documents</dt><dd class="break-words">{created.groupName ?? 'All documents in this room'}</dd>
						<dt class="text-muted-foreground">Protection</dt><dd>{[created.settings.verifyEmail ? 'Verified email' : 'Unverified email', created.settings.requireNda ? 'NDA required' : 'No NDA', created.settings.watermark ? 'Watermarked' : 'No watermark', ...(created.hasPassword ? ['Password required'] : [])].join(' · ')}</dd>
						<dt class="text-muted-foreground">Downloads</dt><dd>{downloadLabels[created.settings.downloads]}</dd>
						<dt class="text-muted-foreground">Expires</dt><dd>{created.expiresAt ? formatDate(created.expiresAt, timeZone) : 'No expiry'}</dd>
					</dl>
					{#if created.settings.downloads !== 'per_file'}<p class="text-xs text-muted-foreground">Download-only files remain downloadable. Use a document group to hide files that should not be shared.</p>{/if}
					{@render verificationHelp(created.settings.verifyEmail, created.open)}
					<div class="flex flex-wrap gap-2"><Button bind:ref={copyButton} class="min-h-11" onclick={() => created && copyText(created.url, 'Link copied')}><Copy data-icon="inline-start" />Copy link</Button><Button variant="outline" class="min-h-11" onclick={() => created && openPreview(created.id)}><Eye data-icon="inline-start" />Preview as investor</Button></div>
					{#if individualEmails.length && emailReady}<div class="flex flex-col gap-2"><Button variant="outline" class="min-h-11 w-full" disabled={sendingInvite || invitationSent} onclick={sendInvitation}><Mail data-icon="inline-start" />{sendingInvite ? 'Sending…' : invitationSent ? 'Invitation queued' : 'Email invitation'}</Button><p class="break-words text-xs text-muted-foreground">To: {individualEmails.map((entry) => entry.value).join(', ')}. Domain entries are not emailed.</p></div>{:else}<p class="text-xs text-muted-foreground">{emailReady ? 'Copy the link to invite this audience. Email invitations need individual email addresses on the allow list.' : 'Copy the link to share it with your audience.'}</p>{/if}
					{#if invitation}<p role="status" class="text-sm">{invitation}</p>{/if}
					{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
				</div>
				<Dialog.Footer class="shrink-0 border-t px-6 py-4"><Button variant="outline" class="min-h-11" disabled={sendingInvite} onclick={() => requestOpen(false)}>Done</Button></Dialog.Footer>
			</div>
		{:else}
		<form class="flex min-h-0 flex-col" onsubmit={save}>
			<fieldset disabled={busy} class="min-h-0 min-w-0 overflow-y-auto px-6 py-5">
				<Field.Group class="gap-5">
					<Field.Field><Field.Label for="link-label">Link name</Field.Label><Input id="link-label" required maxlength={120} placeholder="e.g. Northstar Capital" bind:value={label} /><Field.Description>Only your team sees this name.</Field.Description></Field.Field>
					<Field.Field>
						<Field.Label for="link-audience">Who can enter?</Field.Label>
						<select id="link-audience" class="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={isOpen}>
							<option value={false}>Only allowed emails or domains</option>
							<option value={true}>Anyone with the link</option>
						</select>
					</Field.Field>
					{#if !isOpen}
						<Field.Field>
							<Field.Label for="link-allow">Allowed emails or domains</Field.Label>
							<Textarea id="link-allow" required rows={2} placeholder={'alex@fund.com\nfund.com'} bind:value={allow} />
							<Field.Description>One per line. Domains include their subdomains.</Field.Description>
						</Field.Field>
					{/if}
					<Field.Field>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<Field.Label for="choice-verifyEmail">Email verification</Field.Label>
							<select id="choice-verifyEmail" class={selectClass} bind:value={choices.verifyEmail}>
								<option value="room">Room default ({defaults.verifyEmail ? 'on' : 'off'})</option>
								<option value="on" disabled={!emailReady && choices.verifyEmail !== 'on'}>On</option>
								<option value="off">Off</option>
							</select>
						</div>
						{@render verificationHelp(effective('verifyEmail'), isOpen)}
					</Field.Field>
					<Field.Field><Field.Label for="link-group">Document access</Field.Label><select id="link-group" class="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={groupId}><option value="">All documents in this room</option>{#if groupId && !availableGroups.some((group) => group.id === groupId)}<option value={groupId} disabled>Selected group is no longer available</option>{/if}{#each availableGroups as group (group.id)}<option value={group.id}>{group.name}</option>{/each}</select><Field.Description>{groupId ? 'Only documents available to this group are visible.' : 'Includes documents added to this room later.'}</Field.Description><details class="group">
							<summary class="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm font-medium">{groupId ? 'Manage group access' : 'Choose specific documents'}<ChevronDown class="size-4 group-open:rotate-180" /></summary>
							<p class="mb-1 text-xs text-muted-foreground">Edit groups in a new tab, then refresh this list.</p>
							<div class="flex flex-wrap items-center gap-2">
								<Button href={groupId ? `/admin/rooms/${roomId}/groups/${groupId}` : `/admin/rooms/${roomId}/groups`} target="_blank" rel="noreferrer" variant="outline" size="sm">{groupId ? 'Review permissions' : 'Manage groups'}<ArrowUpRight data-icon="inline-end" /></Button>
								<Button type="button" variant="ghost" size="sm" disabled={refreshingGroups} onclick={refreshGroups}>{refreshingGroups ? 'Refreshing…' : 'Refresh groups'}</Button>
							</div>
							{#if groupError}<p role="alert" class="text-sm text-destructive">{groupError}</p>{/if}
						</details></Field.Field>

					<details class="group rounded-xl border">
						<summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5"><span><span class="block text-sm font-medium">Document protection</span><span class="mt-1 block text-[11px] text-muted-foreground">{effective('watermark') ? 'Watermarked' : 'No watermark'} · {effective('requireNda') ? 'NDA required' : 'No NDA'} · {downloadLabels[downloads === 'room' ? defaults.downloads : downloads]}</span></span><ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
						<div class="flex flex-col gap-4 border-t px-4 py-4">
							{#each toggles.filter((item) => item.key !== 'verifyEmail') as toggle (toggle.key)}<Field.Field orientation="horizontal"><Field.Label for="choice-{toggle.key}" class="min-w-0 text-xs">{toggle.label}</Field.Label><select id="choice-{toggle.key}" class={selectClass} bind:value={choices[toggle.key]}><option value="room">Room default ({defaults[toggle.key] ? 'on' : 'off'})</option><option value="on" disabled={toggle.key === 'requireNda' && !hasNda && choices[toggle.key] !== 'on'}>On</option><option value="off">Off</option></select></Field.Field>{/each}
							{#if !hasNda}<p class="text-[11px] text-muted-foreground">Add NDA text in Room settings before requiring an agreement.</p>{/if}
							<Field.Field orientation="horizontal"><Field.Label for="choice-downloads" class="text-xs">Downloads</Field.Label><select id="choice-downloads" class={selectClass} bind:value={downloads}><option value="room">Room default ({downloadLabels[defaults.downloads]})</option><option value="none">No downloads</option><option value="per_file">Each file</option><option value="zip">All allowed files as one zip</option></select></Field.Field>
							<p class="text-xs leading-relaxed text-muted-foreground">Download-only files stay downloadable even with “No downloads”. Choose a document group above to hide them.</p>
						</div>
					</details>
					<details class="group rounded-xl border"><summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-medium">Password, expiry & blocked emails<ChevronDown class="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary><div class="flex flex-col gap-5 border-t px-4 py-4"><Field.Group class="gap-5"><Field.Field><Field.Label for="link-password">{link?.hasPassword ? 'New password' : 'Password (optional)'}</Field.Label><Input id="link-password" type="password" autocomplete="new-password" minlength={8} bind:value={password} />{#if link?.hasPassword}<label class="flex items-center gap-2 text-xs"><input type="checkbox" bind:checked={removePassword} disabled={!!password} />Remove the existing password</label>{/if}</Field.Field><Field.Field><Field.Label for="link-expires">Expiry date (optional)</Field.Label><Input id="link-expires" class="min-w-0" type="date" min={localDate(Date.now())} bind:value={expires} /></Field.Field><Field.Field><Field.Label for="link-blocks">Blocked emails or domains</Field.Label><Textarea id="link-blocks" rows={2} placeholder="restricted@fund.com" bind:value={blocks} /><Field.Description>Blocks always take priority over allowed emails.</Field.Description></Field.Field></Field.Group></div></details>
					<details class="group rounded-xl border" open={!!link?.welcomeMarkdown}>
						<summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><span><span class="block text-sm font-medium">Personal welcome</span><span class="mt-1 block text-xs text-muted-foreground">{welcome.trim() ? 'Custom note for this link' : 'Using the room introduction'}</span></span><ChevronDown class="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
						<Tabs.Root bind:value={welcomePane} class="border-t p-4"><Tabs.List aria-label="Personal welcome editor" class="h-auto"><Tabs.Trigger value="edit" class="min-h-11">Edit</Tabs.Trigger><Tabs.Trigger value="preview" class="min-h-11">Preview</Tabs.Trigger></Tabs.List><Tabs.Content value="edit" class="pt-3"><Field.Field><Field.Label for="link-welcome">Message for this audience</Field.Label><Textarea id="link-welcome" rows={7} style="field-sizing: fixed" maxlength={4000} bind:value={welcome} placeholder="Welcome, Northstar team. Start with our company overview and financial highlights." /><Field.Description>Everyone using this link sees this note after passing access checks. It replaces the room introduction inside the room. Markdown is supported; leave blank to use the room introduction.</Field.Description></Field.Field>{#if welcome.trim()}<Button type="button" variant="ghost" class="mt-2 min-h-11" onclick={() => (welcome = '')}>Use room introduction</Button>{/if}</Tabs.Content><Tabs.Content value="preview" class="pt-3">{#if welcome.trim()}<div class="md text-sm leading-relaxed [overflow-wrap:anywhere] [&_img]:max-w-full">{@html welcomeHtml}</div>{:else}<p class="text-sm text-muted-foreground">This link will use the room introduction. Add a message in Edit to personalize it.</p>{/if}</Tabs.Content></Tabs.Root>
					</details>
				</Field.Group>
			</fieldset>
			<div class="shrink-0 border-t bg-muted/30 px-4 py-3 sm:px-6 sm:py-4">{#if error}<p class="mb-3 text-sm text-destructive" role="alert">{error}</p>{/if}<Dialog.Footer class="grid grid-cols-2 sm:flex sm:items-center sm:justify-end"><Button type="button" class="min-h-11 sm:min-w-32" variant="outline" disabled={busy} onclick={() => requestOpen(false)}>Cancel</Button><Button type="submit" class="min-h-11 sm:min-w-32" disabled={busy}>{busy ? 'Saving…' : link ? 'Save changes' : 'Create link'}<ArrowRight data-icon="inline-end" /></Button></Dialog.Footer></div>
		</form>
		{/if}
 <AlertDialog.Root bind:open={discardOpen} onOpenChangeComplete={(value) => { if (!value && discardConfirmed) { discardConfirmed = false; open = false; } }}><AlertDialog.Content><AlertDialog.Header><AlertDialog.Title>Discard unsaved changes?</AlertDialog.Title><AlertDialog.Description>Your sharing link has changes that have not been saved. Keep editing to preserve your draft.</AlertDialog.Description></AlertDialog.Header><AlertDialog.Footer class="sm:items-center"><AlertDialog.Cancel variant="default" class="min-h-11">Keep editing</AlertDialog.Cancel><AlertDialog.Action variant="outline" class="min-h-11" onclick={() => { initialDraft = draft; discardConfirmed = true; discardOpen = false; }}>Discard changes</AlertDialog.Action></AlertDialog.Footer></AlertDialog.Content></AlertDialog.Root>
	</Dialog.Content>
</Dialog.Root>
