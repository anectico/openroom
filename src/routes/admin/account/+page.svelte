<script lang="ts">
	import { Mail } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { act, attempt } from '#lib/admin/op.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';

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

<svelte:head><title>My account · OpenRoom</title></svelte:head>

<h1 class="mb-6 text-2xl font-semibold">My account</h1>
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
	<section id="email-preferences" aria-labelledby="preferences-heading" class="min-w-0 rounded-xl border bg-card">
		<div class="p-4">
			<h2 id="preferences-heading" class="text-lg font-semibold">Email preferences</h2>
			{#if data.emailReady}
				<p class="mt-1 text-sm text-muted-foreground">Choose which events you receive by email.</p>
			{:else}
				<Alert.Root class="mt-3 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
					<Mail aria-hidden="true" />
					<Alert.Title>Email notifications are off</Alert.Title>
					<Alert.Description>
						{#if data.member?.role === 'owner'}
							Add an email provider to choose which notifications you receive by email.
						{:else}
							Ask a workspace owner to add an email provider so you can choose which notifications you receive by email.
						{/if}
					</Alert.Description>
					{#if data.member?.role === 'owner'}
						<Button href="/admin/settings#email" size="sm" class="col-start-2 mt-2 justify-self-start">Set up email provider</Button>
					{/if}
				</Alert.Root>
			{/if}
		</div>
		<ul class="divide-y border-t">
			{#each data.prefs as p (p.event)}
				<li class="flex items-center justify-between gap-4 px-4 py-3 text-sm">
					<label for="pref-{p.event}">{p.label}</label>
					<Switch
						id="pref-{p.event}"
						checked={p.email}
						disabled={!data.emailReady}
						onCheckedChange={(v) => act('set_notification_pref', { event: p.event, email: v }, 'Saved')}
					/>
				</li>
			{/each}
		</ul>
	</section>
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
