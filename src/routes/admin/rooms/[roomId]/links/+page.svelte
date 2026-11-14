<script lang="ts">
	import { Copy, Eye, Link2, MoreHorizontal, Plus, } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import LinkEditor from '#lib/admin/LinkEditor.svelte';
	import { act, attempt, copyText, formatDate } from '#lib/admin/op.ts';
	import { openPreview } from '#lib/admin/preview.ts';
	import type { Link } from '#lib/admin/types.ts';
	import When from '#lib/admin/When.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(!room.frozenAt);
	let editorOpen = $state(false);
	let editing = $state<Link | null>(null);
	afterNavigate(({ to }) => {
		if (!canEdit || !to?.url.searchParams.has('new')) return;
		editing = null;
		editorOpen = true;
		const next = new URL(to.url);
		next.searchParams.delete('new');
		replaceState(next, page.state);
	});
	let revoking = $state<Link | null>(null);
	let revoker = $state<ReturnType<typeof DangerAction>>();
	let allRevoker = $state<ReturnType<typeof DangerAction>>();

	function who(link: Link) {
		if (link.open) return 'Any email';
		const first = link.allow.slice(0, 2).map((e) => e.value);
		return first.join(', ') + (link.allow.length > 2 ? ` and ${link.allow.length - 2} more` : '');
	}

	let readdressing = $state<Link | null>(null);
	let newUrl = $state('');
	let readdressError = $state('');
	let changingAddress = $state(false);

	const copy = (link: Link) => copyText(link.url, 'Link copied');
	const copyInvite = (link: Link) =>
		copyText(
			`You are invited to the ${room.name} data room. Open it here:\n${link.url}${link.settings.verifyEmail ? '\n\nYou will be asked to confirm your email.' : ''}`,
			'Invite text copied',
		);

	const preview = (link: Link) => openPreview(link.id);

	async function sendInvites(link: Link) {
		const r = await act<{ sent: number; skipped: string[] }>('send_link_invites', { linkId: link.id });
		if (r) toast.success(r.sent ? `Invite sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}` : 'Nobody to send to');
	}

	const emails = (link: Link) => link.allow.filter((e) => e.kind === 'email').length;

	async function readdress() {
		if (!readdressing || changingAddress) return;
		changingAddress = true;
		readdressError = '';
		try {
			const r = await attempt<Link>('new_link_address', { linkId: readdressing.id });
			if (r.ok) newUrl = r.data.url;
			else readdressError = r.error;
		} finally {
			changingAddress = false;
		}
	}

	async function revoke(link: Link) {
		revoking = link;
		await tick();
		await revoker?.start();
	}
</script>

<svelte:head><title>{room.name} · Links · OpenRoom</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 class="text-sm font-semibold">Sharing links</h2><p class="mt-1 text-xs text-muted-foreground">One link per investor or firm. You stay in control of every visit.</p></div><div class="flex items-center gap-2"><Button variant="outline" size="sm" href="?{data.includeInactive ? '' : 'all=1'}">{data.includeInactive ? 'Active links only' : 'Include inactive'}</Button>{#if canEdit && room.activeLinkCount > 0}<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm" aria-label="Sharing options"><MoreHorizontal /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end"><DropdownMenu.Group><DropdownMenu.Item onSelect={() => allRevoker?.start()} variant="destructive">Revoke all links…</DropdownMenu.Item></DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root><span><DangerAction bind:this={allRevoker} showButton={false} operation="revoke_all_links" input={{ roomId: room.id }} label="Revoke all links" title="Revoke every link of this room?" success="All links revoked" /></span>{/if}</div></div>
{#if data.links.length === 0}
	<Empty.Root class="rounded-xl border bg-card py-14"><Empty.Header><Empty.Media variant="icon"><Link2 /></Empty.Media><Empty.Title>Start the conversation</Empty.Title><Empty.Description>Create a personal sharing link for an investor. Choose their access, then copy the link or email an invitation.</Empty.Description></Empty.Header>{#if canEdit}<Empty.Content><Button onclick={() => { editing = null; editorOpen = true; }}><Plus data-icon="inline-start" />Create your first link</Button></Empty.Content>{/if}</Empty.Root>
{:else}
	<div class="overflow-hidden rounded-xl border bg-card"><Table.Root><Table.Header><Table.Row><Table.Head class="pl-5">Link & audience</Table.Head><Table.Head class="hidden md:table-cell">Protection</Table.Head><Table.Head class="hidden sm:table-cell">Last opened</Table.Head><Table.Head class="hidden text-right lg:table-cell">Investors</Table.Head><Table.Head class="w-24"><span class="sr-only">Link actions</span></Table.Head></Table.Row></Table.Header><Table.Body>
		{#each data.links as link (link.id)}
			<Table.Row><Table.Cell class="max-w-0 py-4 pl-5 sm:max-w-none"><div class="flex min-w-0 items-center gap-3"><span class="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:flex"><Link2 class="size-4" /></span><div class="min-w-0"><div class="flex items-center gap-2"><button type="button" disabled={!canEdit || link.status === 'revoked'} class="truncate text-left text-[13px] font-medium hover:text-primary disabled:cursor-default" onclick={() => { editing = link; editorOpen = true; }}>{link.label}</button>{#if link.status !== 'active'}<Badge variant="outline">{link.status === 'expired' ? 'Expired' : 'Revoked'}</Badge>{/if}</div><p class="mt-1 truncate text-[11px] text-muted-foreground">{who(link) || 'No allowed emails'}{link.groupName ? ` · ${link.groupName}` : ''}</p><p class="mt-2 whitespace-normal break-words text-xs text-muted-foreground md:hidden">{link.settings.verifyEmail ? 'Verified email' : 'Email not verified'} · {link.settings.requireNda ? 'NDA required' : 'No NDA'}{link.hasPassword ? ' · Password' : ''}{link.settings.watermark ? ' · Watermarked' : ''}</p>{#if link.expiresAt}<p class="mt-1 text-[10px] text-muted-foreground">Expires {formatDate(link.expiresAt, data.timeZone)}</p>{/if}</div></div></Table.Cell>
			<Table.Cell class="hidden md:table-cell"><div class="flex max-w-56 flex-wrap gap-1.5">{#if link.settings.verifyEmail}<Badge variant="outline">Verified email</Badge>{/if}{#if link.settings.requireNda}<Badge variant="outline">NDA</Badge>{/if}{#if link.settings.watermark}<Badge variant="outline">Watermark</Badge>{/if}{#if link.hasPassword}<Badge variant="outline">Password</Badge>{/if}{#if !link.settings.verifyEmail && !link.hasPassword}<span class="text-[11px] text-muted-foreground">Email entry</span>{/if}</div></Table.Cell>
			<Table.Cell class="hidden text-xs text-muted-foreground sm:table-cell"><When at={link.lastOpenedAt} timeZone={data.timeZone} /></Table.Cell><Table.Cell class="hidden text-right text-sm tabular-nums lg:table-cell">{link.viewerCount}</Table.Cell>
			<Table.Cell><div class="flex justify-end gap-1">{#if link.status !== 'revoked'}<Button variant="outline" size="icon-sm" aria-label="Copy link for {link.label}" onclick={() => copy(link)}><Copy /></Button><DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {link.label}"><MoreHorizontal /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end" class="min-w-56"><DropdownMenu.Group><DropdownMenu.Item onSelect={() => copy(link)}><Copy />Copy link</DropdownMenu.Item><DropdownMenu.Item onSelect={() => copyInvite(link)}>Copy invitation text</DropdownMenu.Item>{#if link.status === 'active'}<DropdownMenu.Item onSelect={() => preview(link)}><Eye />Preview as this investor</DropdownMenu.Item>{#if emails(link) > 0}<DropdownMenu.Item disabled={!data.emailReady} onSelect={() => sendInvites(link)}>Email invitation{#if !data.emailReady}<Badge variant="outline">Needs email</Badge>{/if}</DropdownMenu.Item>{/if}{/if}</DropdownMenu.Group>{#if canEdit}<DropdownMenu.Separator /><DropdownMenu.Group><DropdownMenu.Item onSelect={() => { editing = link; editorOpen = true; }}>Edit access & protection</DropdownMenu.Item><DropdownMenu.Item onSelect={() => { readdressing = link; newUrl = ''; readdressError = ''; }}>Generate a new address…</DropdownMenu.Item><DropdownMenu.Item variant="destructive" onSelect={() => revoke(link)}>Revoke link…</DropdownMenu.Item></DropdownMenu.Group>{/if}</DropdownMenu.Content></DropdownMenu.Root>{/if}</div></Table.Cell></Table.Row>
		{/each}
	</Table.Body></Table.Root></div>
{/if}

<LinkEditor
	bind:open={editorOpen}
	roomId={room.id}
	timeZone={data.timeZone}
	defaults={room.linkDefaults}
	hasNda={room.hasNda}
	link={editing}
	groups={data.groups}
	emailReady={data.emailReady}
	isOwner={data.member?.role === 'owner'}
/>

{#if revoking}
	<DangerAction
		bind:this={revoker}
		showButton={false}
		operation="revoke_link"
		input={{ linkId: revoking.id }}
		label="Revoke"
		confirmLabel="Revoke link"
		title="Revoke “{revoking.label}”?"
		description="The address stops working and anyone in the room through it loses access at once. This cannot be undone; make a new link instead."
		success="Link revoked"
	/>
{/if}

<AlertDialog.Root open={!!readdressing} onOpenChange={(o) => !o && !changingAddress && (readdressing = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{newUrl ? 'The new address' : `New address for “${readdressing?.label}”?`}</AlertDialog.Title>
			<AlertDialog.Description>
				{newUrl
					? 'The old address stopped working. Send this one to the people on the link.'
					: 'The current address stops working at once. Settings, lists and history stay.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if newUrl}
			<div class="flex gap-2">
				<Input readonly value={newUrl} aria-label="New link address" />
				<Button variant="outline" onclick={() => copyText(newUrl, 'Link copied')}>Copy</Button>
			</div>
		{/if}
		{#if readdressError}<p class="text-sm text-destructive" role="alert">{readdressError}</p>{/if}
		<AlertDialog.Footer>
			{#if newUrl}
				<Button onclick={() => (readdressing = null)}>Done</Button>
			{:else}
				<AlertDialog.Cancel disabled={changingAddress}>Cancel</AlertDialog.Cancel>
				<Button variant="destructive" disabled={changingAddress} onclick={readdress}>{changingAddress ? 'Generating…' : 'Generate new address'}</Button>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
