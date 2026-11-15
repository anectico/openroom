<script lang="ts">
	import { CalendarDays, Copy, Mail, ShieldCheck } from '@lucide/svelte';
	import { tick } from 'svelte';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import DetailSummary from '#lib/admin/DetailSummary.svelte';
	import { act, attempt, copyText, formatDate } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';

	let { data } = $props();
	const roleHelp = {
		owner: 'Everything, including members and install settings.',
		admin: 'Rooms, files, links and investors; not members, install settings or deleting rooms.',
		observer: 'Reads rooms and activity; changes nothing.',
	};

	let inviteOpen = $state(false);
	let resultOpen = $state(false);
	let email = $state('');
	let role = $state<'owner' | 'admin' | 'observer'>('admin');
	type Invitation = (typeof data.invites)[number] & { url: string; emailed: boolean };
	let created = $state<Invitation | null>(null);
	let inviteError = $state('');

	async function invite(event: SubmitEvent) {
		event.preventDefault();
		const r = await attempt<Invitation>('invite_member', { email, role });
		if (!r.ok) {
			inviteError = r.error;
			return;
		}
		created = r.data;
		email = '';
		inviteError = '';
		(document.activeElement as HTMLElement | null)?.blur();
		inviteOpen = false;
		await tick();
		resultOpen = true;
	}

	async function resend(id: string) {
		const r = await act<Invitation>('resend_invite', { inviteId: id });
		if (r) {
			created = r;
			resultOpen = true;
		}
	}

	const copy = (text: string) => copyText(text);

	const roleOptions = [{ value: 'admin', label: 'Admin' }, { value: 'observer', label: 'Observer' }, { value: 'owner', label: 'Owner' }] as const;
</script>

<svelte:head><title>Members · Settings · OpenRoom</title></svelte:head>

<div class="mb-4 flex justify-end">
	<Button onclick={() => (inviteOpen = true)}>Invite a member</Button>
</div>

<div class="overflow-hidden rounded-xl border bg-card">
	<Table.Root>
		<Table.Header class="hidden sm:table-header-group">
			<Table.Row>
				<Table.Head>Member</Table.Head>
				<Table.Head>Role</Table.Head>
				<Table.Head>Last active</Table.Head>
				<Table.Head class="w-28"><span class="sr-only">Actions</span></Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.members as m (m.id)}
				<Table.Row class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 p-4 sm:table-row sm:p-0">
					<Table.Cell class="min-w-0 whitespace-normal p-0 sm:p-2">
						<p class="font-medium">{m.name}</p>
						<p class="text-xs break-all text-muted-foreground">{m.email}{m.id === data.member?.id ? ' (you)' : ''}</p><p class="mt-1 text-[11px] text-muted-foreground sm:hidden">Active <When at={m.lastActiveAt} timeZone={data.timeZone} /></p>
					</Table.Cell>
					<Table.Cell class="p-0 sm:p-2">
						<ChoiceSelect label="Role of {m.email}" bind:value={() => m.role, (role) => act('change_member_role', { memberId: m.id, role }, 'Role changed')}
							options={roleOptions}
						/>
					</Table.Cell>
					<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"><When at={m.lastActiveAt} timeZone={data.timeZone} /></Table.Cell>
					<Table.Cell class="col-span-2 p-0 pt-2 empty:hidden sm:table-cell sm:p-2">
						{#if m.id !== data.member?.id}
							<DangerAction
								operation="remove_member"
								input={{ memberId: m.id }}
								label="Remove"
								confirmLabel="Remove member"
								title="Remove {m.email}?"
								success="Member removed"
							/>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
			{#each data.invites as i (i.id)}
				<Table.Row class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 p-4 sm:table-row sm:p-0">
					<Table.Cell class="min-w-0 whitespace-normal p-0 sm:p-2">
						<p class="break-all">{i.email}</p>
						<p class="text-xs text-muted-foreground">
							{i.expired ? 'Invite expired' : `Invited, until ${formatDate(i.expiresAt, data.timeZone)}`}
						</p>
					</Table.Cell>
					<Table.Cell class="p-0 sm:p-2"><Badge variant="outline">{i.role}</Badge></Table.Cell>
					<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell">Pending</Table.Cell>
					<Table.Cell class="col-span-2 p-0 pt-3 sm:table-cell sm:p-2">
						<div class="flex gap-1">
						<Button variant="outline" size="sm" onclick={() => resend(i.id)}>Resend</Button>
						<Button variant="ghost" size="sm" onclick={() => act('cancel_invite', { inviteId: i.id }, 'Invite cancelled')}
							>Cancel</Button
						>
						</div>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>

<Dialog.Root bind:open={inviteOpen}>
	<Dialog.Content>
			<Dialog.Header><Dialog.Title>Invite a member</Dialog.Title></Dialog.Header>
			<form class="space-y-4" onsubmit={invite}>
				<div class="space-y-2">
					<Label for="invite-email">Email</Label>
					<Input id="invite-email" type="email" required bind:value={email} />
				</div>
				<div class="space-y-2">
					<Label for="invite-role">Role</Label>
					<ChoiceSelect id="invite-role" class="w-full" bind:value={role}
						options={roleOptions}
					/>
					<p class="text-xs text-muted-foreground">{roleHelp[role]}</p>
				</div>
				{#if inviteError}<p class="text-sm text-destructive" role="alert">{inviteError}</p>{/if}
				<Dialog.Footer>
					<Button type="submit">{data.emailReady ? 'Send invite' : 'Create invite link'}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={resultOpen}>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto">
		{#if created}
			<Dialog.Header>
				<Dialog.Title>Invite ready</Dialog.Title>
				<Dialog.Description>
					{created.emailed
						? 'The one-time invitation is queued for email delivery.'
						: 'Copy the one-time link and send it to the recipient.'}
				</Dialog.Description>
			</Dialog.Header>
			<DetailSummary label="Invitation details"
				primary={{ label: 'Recipient', value: created.email, icon: Mail }}
				details={[
					{ label: 'Workspace role', value: created.role[0].toUpperCase() + created.role.slice(1), icon: ShieldCheck },
					{ label: 'Expires', value: formatDate(created.expiresAt, data.timeZone), icon: CalendarDays },
				]}
			/>
			<div class="flex min-w-0 gap-2">
				<Input readonly value={created.url} aria-label="Invite link" />
				<Button variant="outline" onclick={() => created && copy(created.url)}><Copy aria-hidden="true" />Copy link</Button>
			</div>
		{/if}
		<Dialog.Footer>
			<Button onclick={() => (resultOpen = false)}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
