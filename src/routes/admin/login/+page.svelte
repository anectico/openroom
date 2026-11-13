<script lang="ts">
	import { ArrowRight, LockKeyhole } from '@lucide/svelte';
	import Brand from '#lib/admin/Brand.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	let forgot = $state(false);
	let resetSent = $state(false);

	const post = (path: string, body: unknown) =>
		fetch(`/api/auth/${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const response = await post('sign-in/email', { email, password });
			if (response.ok) {
				const next = page.url.searchParams.get('next');
				await goto(next?.startsWith('/admin') ? next : '/admin', { invalidateAll: true });
				return;
			}
			error = response.status === 429
				? 'Too many attempts. Wait a minute and try again.'
				: response.status >= 500 ? 'Sign in is temporarily unavailable. Try again.'
				: 'That email and password do not match a member.';
		} catch { error = 'Connection interrupted. Check your connection and try again.'; }
		finally { busy = false; }
	}

	async function requestReset(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const response = await post('request-password-reset', { email, redirectTo: '/admin/login' });
			if (response.ok) resetSent = true;
			else error = response.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'The reset request could not be sent. Try again.';
		} catch { error = 'Connection interrupted. Check your connection and try again.'; }
		finally { busy = false; }
	}

</script>

<svelte:head><title>Sign in · OpenRoom</title></svelte:head>

<main class="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-10">
	<a href="/" aria-label="OpenRoom"><Brand /></a>
	<Card.Root class="w-full max-w-[400px] gap-5 border py-7 shadow-sm">
		<Card.Header>
			<Card.Title class="text-[26px] font-semibold tracking-tight">{forgot ? 'Reset your password' : 'Welcome back.'}</Card.Title><Card.Description class="mt-2 text-sm">{forgot ? 'Let’s help you get back into your workspace.' : 'Your documents, your investors, your workspace.'}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if page.url.searchParams.get('done') === 'password'}
				<p class="mb-4 rounded-md bg-muted p-3 text-sm">Your password is set. Sign in with it.</p>
			{/if}
			{#if !forgot}
				<form class="space-y-4" onsubmit={signIn}>
					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input id="email" type="email" autocomplete="email" required bind:value={email} />
					</div>
					<div class="space-y-2">
						<Label for="password">Password</Label>
						<Input id="password" type="password" autocomplete="current-password" required bind:value={password} />
					</div>
					{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
					<Button type="submit" class="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
				<Button variant="link" class="mt-2 px-0" disabled={busy} onclick={() => { error = ''; forgot = true; }}>Forgot password</Button>
			{:else if !data.emailReady}
				<p class="text-sm text-muted-foreground">
					Email is not set up on this server, so reset links cannot be emailed. Ask the server owner to run
					<code class="rounded bg-muted px-1">openroom-server reset-password your@email</code>; it prints a link
					that sets a new password.
				</p>
				<Button variant="link" class="mt-2 px-0" onclick={() => (forgot = false)}>Back to sign in</Button>
			{:else if resetSent}
				<p class="text-sm">If this is a member’s email, we sent a reset link. It works once and for 1 hour.</p>
				<Button variant="link" class="mt-2 px-0" onclick={() => {
		forgot = false;
		resetSent = false;
	}}
					>Back to sign in</Button
				>
			{:else}
				<form class="space-y-4" onsubmit={requestReset}>
					<div class="space-y-2">
						<Label for="reset-email">Email</Label>
						<Input id="reset-email" type="email" autocomplete="email" required bind:value={email} />
					</div>
					{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
					<Button type="submit" class="w-full" disabled={busy}>Send reset link</Button>
				</form>
				<Button variant="link" class="mt-2 px-0" onclick={() => (forgot = false)}>Back to sign in</Button>
			{/if}
		</Card.Content>
	</Card.Root>
	<p class="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LockKeyhole class="size-3" />A private workspace, hosted on your server.</p>
	<p class="text-[10px] text-muted-foreground">OpenRoom by Anectico</p>
</main>
