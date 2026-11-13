<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import BrandingForm from '#lib/admin/BrandingForm.svelte';
	import { act, formatDate, op } from '#lib/admin/op.ts';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { data } = $props();
	const initial = untrack(() => ({ general: data.general, email: data.email }));
	const selectClass =
		'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';

	let timeZone = $state(initial.general.timeZone);
	let uploadGb = $state(Math.round((initial.general.uploadMaxBytes / 1024 ** 3) * 10) / 10);
	let cap = $state(initial.general.emailDailyCap);

	let provider = $state<'resend' | 'smtp' | 'none'>(initial.email.provider ?? 'none');
	let from = $state(initial.email.from ?? '');
	let apiKey = $state('');
	let host = $state(initial.email.smtpHost ?? 'smtp.gmail.com');
	let port = $state(initial.email.smtpPort ?? 587);
	let user = $state(initial.email.smtpUser ?? '');
	let password = $state('');
	let testTo = $state('');
	let busy = $state(false);
	const locked = $derived(data.email.source === 'env');

	async function saveGeneral(event: SubmitEvent) {
		event.preventDefault();
		const input: Record<string, unknown> = {};
		if (timeZone !== initial.general.timeZone) input.timeZone = timeZone;
		const bytes = Math.round(uploadGb * 1024 ** 3);
		if (Math.abs(bytes - initial.general.uploadMaxBytes) > 0.05 * 1024 ** 3) input.uploadMaxBytes = bytes;
		if (cap !== initial.general.emailDailyCap) input.emailDailyCap = cap;
		if (!Object.keys(input).length) return;
		await act('update_general_settings', input, 'Saved');
	}

	async function saveEmail(event: SubmitEvent) {
		event.preventDefault();
		const input =
			provider === 'resend'
				? { provider, from, ...(apiKey ? { apiKey } : {}) }
				: provider === 'smtp'
					? { provider, from, host, port, user: user || null, ...(password ? { password } : {}) }
					: { provider };
		if (await act('update_email_settings', input, provider === 'none' ? 'Email turned off' : 'Email saved')) {
			apiKey = '';
			password = '';
		}
	}

	async function test() {
		busy = true;
		try {
			const r = await op<{ sent: boolean; to: string; error: string | null }>('test_email', testTo ? { to: testTo } : {});
			if (r.sent) toast.success(`Test email sent to ${r.to}. Check the inbox and the spam folder.`);
			else toast.error(`The test failed: ${r.error}`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'The test failed.');
		}
		busy = false;
	}
</script>

<svelte:head><title>Settings · OpenRoom</title></svelte:head>

<div class="grid items-start gap-5 xl:grid-cols-2">
	<div class="flex min-w-0 flex-col gap-5">
	<form class="space-y-5 rounded-xl border bg-card p-5 sm:p-6" onsubmit={saveGeneral}>
		<div><h2 class="font-semibold">Workspace preferences</h2><p class="mt-1 text-xs leading-relaxed text-muted-foreground">Choose how dates, uploads and outgoing email work.</p></div>
		<div class="space-y-1">
			<Label>Domain</Label>
			<p class="text-sm">{data.general.domain}</p>
			<p class="text-xs text-muted-foreground">Change it on the server with <code>openroom-server set-domain</code>.</p>
		</div>
		<div class="space-y-2">
			<Label for="tz">Time zone</Label>
			<select id="tz" class={selectClass} bind:value={timeZone}>
				<option value="UTC">UTC</option>
				{#each data.timeZones as tz (tz)}<option value={tz}>{tz}</option>{/each}
			</select>
			<p class="text-xs text-muted-foreground">Dates in the admin pages and emails use it.</p>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="upload-max">Largest upload (GB)</Label>
				<Input id="upload-max" type="number" min={0.1} max={50} step={0.1} bind:value={uploadGb} />
			</div>
			<div class="space-y-2">
				<Label for="cap">Emails per day, at most</Label>
				<Input id="cap" type="number" min={1} bind:value={cap} />
				<p class="text-xs text-muted-foreground">Keep it below your provider’s daily limit.</p>
			</div>
		</div>
		<Button type="submit" size="sm">Save preferences</Button>
	</form>



	</div>
	<div class="flex min-w-0 flex-col gap-5">
	<form id="email" class="space-y-5 rounded-xl border bg-card p-5 sm:p-6" onsubmit={saveEmail}>
		<div class="flex items-center justify-between">
			<h2 class="font-semibold">Email delivery</h2>
			{#if data.email.configured}<Badge variant="secondary">Set up</Badge>{:else}<Badge variant="outline">Off</Badge>{/if}
		</div>
		<p class="text-sm text-muted-foreground">
			Unlocks email verification codes for investors, invite and reset links by email, and notices to you.
			{data.email.sentLastDay} of {data.email.dailyCap} emails sent in the last 24 hours.
		</p>
		{#if locked}
			<p class="rounded-md bg-muted p-3 text-sm">Set by the server’s environment ({data.email.provider}, {data.email.from}).</p>
		{:else}
			<div class="space-y-2">
				<Label for="provider">Provider</Label>
				<select id="provider" class={selectClass} bind:value={provider}>
					<option value="resend">Resend (needs a domain you control)</option>
					<option value="smtp">SMTP, such as Gmail with an app password</option>
					<option value="none">Off</option>
				</select>
			</div>
			{#if provider === 'resend'}
				<ol class="list-decimal space-y-2 rounded-lg bg-muted/50 py-4 pr-4 pl-9 text-xs leading-relaxed text-muted-foreground">
					<li>
						Sign up at <a class="underline" href="https://resend.com/signup" target="_blank" rel="noreferrer">resend.com</a>
						(free: 3,000 emails a month, 100 a day).
					</li>
					<li>Add your domain under Domains and create the DNS records Resend lists.</li>
					<li>Create an API key under API Keys and paste it here.</li>
				</ol>
			{:else if provider === 'smtp'}
				<ol class="list-decimal space-y-2 rounded-lg bg-muted/50 py-4 pr-4 pl-9 text-xs leading-relaxed text-muted-foreground">
					<li>For Gmail, turn on two-step verification on the Google account.</li>
					<li>
						Create an app password at
						<a class="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"
							>myaccount.google.com/apppasswords</a
						> and paste it as the password; the user is your Gmail address.
					</li>
				</ol>
			{/if}
			{#if provider !== 'none'}
				<div class="space-y-2">
					<Label for="from">Send as</Label>
					<Input id="from" required placeholder="Acme <rooms@acme.com>" bind:value={from} />
				</div>
			{/if}
			{#if provider === 'resend'}
				<div class="space-y-2">
					<Label for="api-key">API key</Label>
					<Input
						id="api-key"
						type="password"
						autocomplete="off"
						placeholder={data.email.provider === 'resend' && data.email.hasSecret ? 'Saved; paste a new one to replace it' : 're_…'}
						bind:value={apiKey}
					/>
				</div>
			{:else if provider === 'smtp'}
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="space-y-2 sm:col-span-2">
						<Label for="host">Server</Label>
						<Input id="host" required bind:value={host} />
					</div>
					<div class="space-y-2">
						<Label for="port">Port</Label>
						<Input id="port" type="number" required bind:value={port} />
					</div>
					<div class="space-y-2">
						<Label for="user">User</Label>
						<Input id="user" autocomplete="off" bind:value={user} />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="smtp-pw">Password</Label>
						<Input
							id="smtp-pw"
							type="password"
							autocomplete="off"
							placeholder={data.email.provider === 'smtp' && data.email.hasSecret ? 'Saved; type a new one to replace it' : ''}
							bind:value={password}
						/>
					</div>
				</div>
			{/if}
			<Button type="submit">{provider === 'none' ? 'Save email preferences' : 'Save email'}</Button>
		{/if}
	</form>
	{#if data.email.configured}
		<form
			class="space-y-3 rounded-xl border bg-card p-5 sm:p-6"
			onsubmit={(e) => {
				e.preventDefault();
				test();
			}}
		>
		<Label for="test-to">Send a test email</Label>
		<div class="flex flex-col gap-2 sm:flex-row">
			<Input id="test-to" type="email" placeholder={data.member?.email} bind:value={testTo} />
			<Button variant="outline" type="submit" disabled={busy}>Send test</Button>
		</div>
		{#if data.email.lastError}
			<p class="text-sm text-destructive">Last error: {data.email.lastError}</p>
		{:else if data.email.lastOkAt}
			<p class="text-xs text-muted-foreground">Last email sent {formatDate(data.email.lastOkAt, data.timeZone)}.</p>
		{/if}
		</form>
	{/if}
	</div>
</div>

	<div class="mt-6 space-y-4 rounded-xl border bg-card p-5 sm:p-6">
		<h2 class="font-semibold">Workspace appearance</h2>
		<p class="text-sm text-muted-foreground">Shown on investor pages; each room can use its own instead.</p>
		<BrandingForm branding={data.branding} />
	</div>
