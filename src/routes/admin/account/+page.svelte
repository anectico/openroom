<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { attempt } from '#lib/admin/op.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { data } = $props();
	let current = $state('');
	let next = $state('');
	let repeat = $state('');
	let error = $state('');
	let busy = $state(false);
	let name = $state(untrack(() => data.member?.name ?? ''));
	let nameError = $state('');

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		const r = await attempt('update_profile', { name }, 'Name saved');
		nameError = r.ok ? '' : r.error;
	}

	async function change(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		error = '';
		if (next !== repeat) {
			error = 'The two new passwords are not the same.';
			return;
		}
		busy = true;
		try {
			const response = await fetch('/api/auth/change-password', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ currentPassword: current, newPassword: next, revokeOtherSessions: true }),
			});
			if (response.ok) {
				current = next = repeat = '';
				toast.success('Password changed; your other sessions were signed out.');
				return;
			}
			const body = await response.json().catch(() => null);
			error =
				body?.code === 'INVALID_PASSWORD'
					? 'The current password is wrong.'
					: body?.code === 'PASSWORD_TOO_SHORT'
						? 'Use at least 10 characters.'
						: response.status === 429
							? 'Too many attempts. Wait a minute.'
							: 'The password could not be changed.';
		} catch { error = 'Connection interrupted. Check your connection and try again.'; }
		finally { busy = false; }
	}

	async function signOut() {
		try {
			const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
			if (!response.ok) throw new Error('Sign out could not be completed. Try again.');
			location.href = '/admin/login';
		} catch { toast.error('Sign out could not be completed. Check your connection and try again.'); }
	}
</script>

<svelte:head><title>Account · OpenRoom</title></svelte:head>

<h1 class="mb-6 text-2xl font-semibold">Account</h1>
<div class="grid max-w-xl gap-6">
	<form class="space-y-3 rounded-lg border bg-background p-6" onsubmit={saveName}>
		<div class="space-y-2">
			<Label for="name">Name</Label>
			<div class="flex gap-2">
				<Input id="name" required maxlength={80} bind:value={name} />
				<Button type="submit" variant="outline">Save</Button>
			</div>
			{#if nameError}<p class="text-sm text-destructive" role="alert">{nameError}</p>{/if}
		</div>
		<p class="text-sm"><span class="text-muted-foreground">Email:</span> {data.member?.email}</p>
		<p class="text-sm"><span class="text-muted-foreground">Role:</span> {data.member?.role}</p>
	</form>
	<form class="space-y-4 rounded-lg border bg-background p-6" onsubmit={change}>
		<h2 class="text-lg font-medium">Change password</h2>
		<div class="space-y-2">
			<Label for="cur">Current password</Label>
			<Input id="cur" type="password" autocomplete="current-password" required bind:value={current} />
		</div>
		<div class="space-y-2">
			<Label for="new">New password (at least 10 characters)</Label>
			<Input id="new" type="password" autocomplete="new-password" minlength={10} required bind:value={next} />
		</div>
		<div class="space-y-2">
			<Label for="new2">The same new password again</Label>
			<Input id="new2" type="password" autocomplete="new-password" required bind:value={repeat} />
		</div>
		{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
		<p class="text-xs text-muted-foreground">Changing it signs you out everywhere else.</p>
		<Button type="submit" disabled={busy}>Change password</Button>
	</form>
	<div><Button variant="outline" onclick={signOut}>Sign out</Button></div>
</div>
