<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	let password = $state('');
	let repeat = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (password !== repeat) {
			error = 'The two passwords are not the same.';
			return;
		}
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ newPassword: password, token: page.params.token }),
			});
			if (response.ok) {
				await goto('/admin/login?done=password');
				return;
			}
			const body = await response.json().catch(() => null);
			error =
				body?.code === 'PASSWORD_TOO_SHORT'
					? 'Use at least 10 characters.'
					: response.status === 429 ? 'Too many attempts. Wait a minute and try again.'
					: response.status >= 500 ? 'The password could not be set. Try again.'
					: 'This link no longer works. Ask an owner for a new one.';
		} catch { error = 'Connection interrupted. Check your connection and try again.'; }
		finally { busy = false; }
	}
</script>

<svelte:head><title>Set your password · OpenRoom</title></svelte:head>

<main class="flex min-h-[90vh] items-center justify-center bg-muted/30 px-4">
	<Card.Root class="w-full max-w-sm">
		{#if !data.valid}
			<Card.Header><Card.Title class="text-xl">This link has expired</Card.Title></Card.Header>
			<Card.Content class="space-y-2 text-sm text-muted-foreground">
				<p>Invite and reset links work once and for a limited time.</p>
				<p>Ask an owner for a new invite, or <a class="underline" href="/admin/login">request a new reset link</a>.</p>
			</Card.Content>
		{:else}
			<Card.Header>
				<Card.Title class="text-xl">{data.invite ? 'Welcome to OpenRoom' : 'Set a new password'}</Card.Title>
				{#if data.invite}<Card.Description>Choose a password to finish joining.</Card.Description>{/if}
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={submit}>
					<div class="space-y-2">
						<Label for="pw">New password (at least 10 characters)</Label>
						<Input id="pw" type="password" autocomplete="new-password" minlength={10} required bind:value={password} />
					</div>
					<div class="space-y-2">
						<Label for="pw2">The same password again</Label>
						<Input id="pw2" type="password" autocomplete="new-password" required bind:value={repeat} />
					</div>
					{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
					<Button type="submit" class="w-full" disabled={busy}>Set password</Button>
				</form>
			</Card.Content>
		{/if}
	</Card.Root>
</main>
