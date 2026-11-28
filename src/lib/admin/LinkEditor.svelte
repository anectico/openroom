<script lang="ts">
	import { parseDate, today } from '@internationalized/date';
	import { ArrowRight, ArrowUpRight, ChevronDown, Copy, Eye, Mail } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
 import * as Alert from '#lib/components/ui/alert/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { renderWelcome } from '#lib/welcome-markdown.ts';
import { beforeNavigate, invalidateAll } from '$app/navigation';
	import LinkAccessSummary from './LinkAccessSummary.svelte';
	import { copyText, op } from './op.ts';
	import { openPreview } from './preview.ts';
	import { downloadLabels, type Link, type LinkSettings } from './types.ts';
	import WelcomeEditor from "./WelcomeEditor.svelte";

	let {
		open = $bindable(false),
		roomId,
		defaults,
		hasNda,
		link = null,
		template = null,
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
		template?: Link | null;
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
		{ key: 'notifyEveryView', label: 'Notify me on every visit' },
	] as const;

	let label = $state('');
	let welcome = $state('');
	let welcomePane = $state('edit');
	let welcomeExpanded = $state(false);
	const welcomeHtml = $derived(renderWelcome(welcome));
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
	let openedNdaSetup = false;
	async function refreshEmailSetup() {
		if (!open || (!openedEmailSetup && !openedNdaSetup)) return;
		await invalidateAll().catch(() => {});
		if (emailReady) openedEmailSetup = false;
		if (hasNda) openedNdaSetup = false;
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
			const source = link ?? template;
			label = link ? link.label : template ? `${template.label} (copy)`.slice(0, 120) : '';
			welcome = source?.welcomeMarkdown ?? '';
			welcomePane = 'edit';
			welcomeExpanded = !!source?.welcomeMarkdown;
			isOpen = source?.open ?? false;
			allow = source?.allow.map((e) => e.value).join('\n') ?? '';
			blocks = source?.blocks.filter((e) => link || e.value !== 'Erased investor').map((e) => e.value).join('\n') ?? '';
			password = '';
			removePassword = false;
			const start = source?.expiresAt && source.expiresAt > Date.now() ? localDate(source.expiresAt) : '';
			expires = start;
			initialExpires = link ? start : '';
			const next: Record<string, Choice> = {};
			for (const t of toggles)
				next[t.key] = source?.overridden.includes(t.key) ? (source.settings[t.key] ? 'on' : 'off') : 'room';
			choices = next;
			downloads = source?.overridden.includes('downloads') ? source.settings.downloads : 'room';
			groupId = source?.groupId ?? '';
			error = '';
 initialDraft = JSON.stringify({ label, welcome, isOpen, allow, blocks, password, removePassword, expires, choices, downloads, groupId });
 discardOpen = false;
		});
	});

	function localDate(ms: number) {
		return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
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
		if (busy || welcome.length > 4000) return;
		if (groupId && !availableGroups.some((group) => group.id === groupId)) { error = 'This group is no longer available. Choose another group before saving.'; return; }
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
			body.expiresAt = expires ? parseDate(expires).add({ days: 1 }).toDate(timeZone).getTime() - 1 : null;
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
					{anyEmail ? 'Investors can enter an email address without proving they own it.' : 'Investors can enter an allowed email address without proving they own it.'}
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
		<p class="text-xs text-muted-foreground">{anyEmail ? 'Investors can enter an email address without proving they own it.' : 'Investors can enter an allowed email address without proving they own it.'}</p>
	{/if}
{/snippet}

<svelte:window onfocus={refreshEmailSetup} onbeforeunload={(event) => { if (open && dirty) event.preventDefault(); }} />
<Dialog.Root bind:open={() => open, requestOpen}>
	<Dialog.Content class="grid grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 transition-none max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0 sm:max-h-[90dvh] sm:max-w-[620px]">
		<Dialog.Header class="shrink-0 border-b px-5 py-4 pr-14 text-left sm:px-6 sm:py-5 sm:pr-16"><Dialog.Title>{created ? 'Sharing link created' : link ? 'Edit sharing link' : template ? 'Duplicate sharing link' : 'Create a sharing link'}</Dialog.Title><Dialog.Description>{created ? 'Review access, then copy the link or send an invitation.' : template ? `A new link with a new address, starting from “${template.label}”.` : 'Choose who can enter and which documents they can see.'}</Dialog.Description></Dialog.Header>
		{#if created}
			<div class="flex min-h-0 flex-col">
				<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
					<Field.Field><Field.Label for="created-link">{created.label}</Field.Label><Input id="created-link" readonly value={created.url} onclick={(event) => event.currentTarget.select()} /></Field.Field>
					<LinkAccessSummary link={created} {timeZone} />
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
			<fieldset disabled={busy} class="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-8 sm:px-6">
				<Field.Group class="gap-5">
					<Field.Field><Field.Label for="link-label">Link name</Field.Label><Input id="link-label" required maxlength={120} placeholder="e.g. Northstar Capital" bind:value={label} /><Field.Description>Only your team sees this name.</Field.Description></Field.Field>
					<Field.Field>
						<Field.Label for="link-audience">Who can enter?</Field.Label>
						<ChoiceSelect id="link-audience" class="min-h-11 w-full" bind:value={() => isOpen ? 'any' : 'restricted', (v) => (isOpen = v === 'any')}
							options={[{ value: 'restricted', label: 'Only allowed emails or domains' }, { value: 'any', label: 'Anyone with the link' }]}
						/>
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
							<ChoiceSelect id="choice-verifyEmail" class="min-h-11" bind:value={choices.verifyEmail}
								options={[{ value: 'room', label: `Room default (${defaults.verifyEmail ? 'on' : 'off'})` }, { value: 'on', label: 'On', disabled: !emailReady && choices.verifyEmail !== 'on' }, { value: 'off', label: 'Off' }]}
							/>
						</div>
						{@render verificationHelp(effective('verifyEmail'), isOpen)}
					</Field.Field>
					<Field.Field><Field.Label for="link-group">Document access</Field.Label><ChoiceSelect id="link-group" class="min-h-11 w-full" bind:value={groupId}
						options={[{ value: '', label: 'All documents in this room' }, ...(groupId && !availableGroups.some((group) => group.id === groupId) ? [{ value: groupId, label: 'Selected group is no longer available', disabled: true }] : []), ...availableGroups.map((group) => ({ value: group.id, label: group.name }))]}
					/><Field.Description>{groupId ? 'Only documents available to this group are visible.' : 'Includes documents added to this room later.'}</Field.Description><details class="group">
							<summary class="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm font-medium">{groupId ? 'Manage group access' : 'Choose specific documents'}<ChevronDown class="size-4 group-open:rotate-180" /></summary>
							<p class="mb-1 text-xs text-muted-foreground">Edit groups in a new tab, then refresh this list.</p>
							<div class="flex flex-wrap items-center gap-2">
								<Button href={groupId ? `/admin/rooms/${roomId}/groups/${groupId}` : `/admin/rooms/${roomId}/groups`} target="_blank" rel="noreferrer" variant="outline" size="sm">{groupId ? 'Review permissions' : 'Manage groups'}<ArrowUpRight data-icon="inline-end" /></Button>
								<Button type="button" variant="ghost" size="sm" disabled={refreshingGroups} onclick={refreshGroups}>{refreshingGroups ? 'Refreshing…' : 'Refresh groups'}</Button>
							</div>
							{#if groupError}<p role="alert" class="text-sm text-destructive">{groupError}</p>{/if}
						</details></Field.Field>

					<details class="group rounded-xl border">
						<summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5"><span><span class="block text-sm font-medium">Document protection</span><span class="mt-1 block text-xs text-muted-foreground">{effective('watermark') ? 'Watermarked' : 'No watermark'} · {effective('requireNda') ? 'NDA required' : 'No NDA'} · {downloadLabels[downloads === 'room' ? defaults.downloads : downloads]}</span></span><ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
						<div class="flex flex-col gap-4 border-t px-4 py-4">
							{#each toggles.filter((item) => item.key !== 'verifyEmail') as toggle (toggle.key)}<Field.Field orientation="horizontal"><Field.Label for="choice-{toggle.key}" class="min-w-0 text-xs">{toggle.label}</Field.Label><ChoiceSelect id="choice-{toggle.key}" class="min-h-11" bind:value={choices[toggle.key]}
								options={[{ value: 'room', label: `Room default (${defaults[toggle.key] ? 'on' : 'off'})` }, { value: 'on', label: 'On', disabled: toggle.key === 'requireNda' && !hasNda && choices[toggle.key] !== 'on' }, { value: 'off', label: 'Off' }]}
							/></Field.Field>{/each}
							{#if !hasNda}<p class="text-xs text-muted-foreground">Publish the room’s NDA before requiring an agreement. <a href="/admin/rooms/{roomId}/nda" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline" onclick={() => (openedNdaSetup = true)}>Set up the NDA <ArrowUpRight class="size-3.5" /><span class="sr-only">(opens in a new tab)</span></a></p>{/if}
							<Field.Field orientation="horizontal"><Field.Label for="choice-downloads" class="text-xs">Downloads</Field.Label><ChoiceSelect id="choice-downloads" class="min-h-11" bind:value={downloads}
								options={[{ value: 'room', label: `Room default (${downloadLabels[defaults.downloads]})` }, { value: 'none', label: downloadLabels.none }, { value: 'per_file', label: downloadLabels.per_file }, { value: 'zip', label: downloadLabels.zip }]}
							/></Field.Field>
							<p class="text-xs leading-relaxed text-muted-foreground">Download-only documents stay downloadable even with “No downloads”. Choose a group above to hide them.</p>
						</div>
					</details>
					<details class="group rounded-xl border"><summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-medium">Password, expiry & blocked emails<ChevronDown class="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary><div class="flex flex-col gap-5 border-t px-4 py-4"><Field.Group class="gap-5"><Field.Field><Field.Label for="link-password">{link?.hasPassword ? 'New password' : 'Password (optional)'}</Field.Label><Input id="link-password" type="password" autocomplete="new-password" minlength={8} bind:value={password} />{#if !link && template?.hasPassword}<Field.Description>The original link’s password is not copied. Set a new one if this link needs it.</Field.Description>{/if}{#if link?.hasPassword}<label class="flex items-center gap-2 text-xs"><input type="checkbox" bind:checked={removePassword} disabled={!!password} />Remove the existing password</label>{/if}</Field.Field><Field.Field><Field.Label for="link-expires">Expiry date (optional)</Field.Label><Input id="link-expires" class="min-w-0" type="date" min={today(timeZone).toString()} aria-describedby="link-expires-zone" bind:value={expires} /><Field.Description id="link-expires-zone">The link stops working at the end of this day in {timeZone}, the workspace time zone.</Field.Description></Field.Field><Field.Field><Field.Label for="link-blocks">Blocked emails or domains</Field.Label><Textarea id="link-blocks" rows={2} placeholder="restricted@fund.com" bind:value={blocks} /><Field.Description>Blocks always take priority over allowed emails.</Field.Description></Field.Field></Field.Group></div></details>
					<details class="group rounded-xl border" bind:open={welcomeExpanded}>
						<summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><span><span class="block text-sm font-medium">Personal welcome</span><span class="mt-1 block text-xs text-muted-foreground">{welcome.trim() ? 'Custom note for this link' : 'Using the room introduction'}</span></span><ChevronDown class="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
						<Tabs.Root bind:value={welcomePane} class="border-t p-4"><Tabs.List aria-label="Personal welcome editor" class="h-auto"><Tabs.Trigger value="edit" class="min-h-11">Edit</Tabs.Trigger><Tabs.Trigger value="preview" class="min-h-11">Preview</Tabs.Trigger></Tabs.List><Tabs.Content value="edit" class="pt-3"><Field.Field><Field.Label for="link-welcome">Message for this audience</Field.Label><WelcomeEditor id="link-welcome" label="Message for this audience" limit={4000} disabled={busy} bind:value={welcome} /><Field.Description>Everyone using this link sees this note after passing access checks. It replaces the room introduction inside the room. Leave blank to use the room introduction.</Field.Description></Field.Field>{#if welcome.trim()}<Button type="button" variant="ghost" class="mt-2 min-h-11" onclick={() => (welcome = '')}>Use room introduction</Button>{/if}</Tabs.Content><Tabs.Content value="preview" class="pt-3">{#if welcome.trim()}<div class="md welcome-copy text-sm leading-relaxed [overflow-wrap:anywhere] [&_img]:max-w-full">{@html welcomeHtml}</div>{:else}<p class="text-sm text-muted-foreground">This link will use the room introduction. Add a message in Edit to personalize it.</p>{/if}</Tabs.Content></Tabs.Root>
					</details>
				</Field.Group>
			</fieldset>
			<div class="shrink-0 border-t bg-muted/30 px-4 py-3 sm:px-6 sm:py-4">{#if error}<p class="mb-3 text-sm text-destructive" role="alert">{error}</p>{/if}<Dialog.Footer class="grid grid-cols-2 sm:flex sm:items-center sm:justify-end"><Button type="button" class="min-h-11 sm:min-w-32" variant="outline" disabled={busy} onclick={() => requestOpen(false)}>Cancel</Button><Button type="submit" class="min-h-11 sm:min-w-32" disabled={busy || welcome.length > 4000}>{busy ? 'Saving…' : link ? 'Save changes' : 'Create link'}<ArrowRight data-icon="inline-end" /></Button></Dialog.Footer></div>
		</form>
		{/if}
 <AlertDialog.Root bind:open={discardOpen} onOpenChangeComplete={(value) => { if (!value && discardConfirmed) { discardConfirmed = false; open = false; } }}><AlertDialog.Content><AlertDialog.Header><AlertDialog.Title>Discard unsaved changes?</AlertDialog.Title><AlertDialog.Description>Your sharing link has changes that have not been saved. Keep editing to preserve your draft.</AlertDialog.Description></AlertDialog.Header><AlertDialog.Footer class="sm:items-center"><AlertDialog.Cancel variant="default" class="min-h-11">Keep editing</AlertDialog.Cancel><AlertDialog.Action variant="outline" class="min-h-11" onclick={() => { initialDraft = draft; discardConfirmed = true; discardOpen = false; }}>Discard changes</AlertDialog.Action></AlertDialog.Footer></AlertDialog.Content></AlertDialog.Root>
	</Dialog.Content>
</Dialog.Root>
