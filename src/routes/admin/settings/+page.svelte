<script lang="ts">
	import { Mail, MailMinus } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import BrandingForm from '#lib/admin/BrandingForm.svelte';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import { act, formatDate, op } from '#lib/admin/op.ts';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { data } = $props();
	const initial = untrack(() => ({ general: data.general, email: data.email }));

	let timeZone = $state(initial.general.timeZone);
	let uploadGb = $state(Math.round((initial.general.uploadMaxBytes / 1024 ** 3) * 10) / 10);
	let cap = $state(initial.general.emailDailyCap);

	const providers = [
		{ value: 'resend', label: 'Resend', logo: '/providers/resend.svg' },
		{ value: 'cloudflare', label: 'Cloudflare', logo: '/providers/cloudflare.svg' },
		{ value: 'smtp', label: 'SMTP', icon: Mail },
		{ value: 'none', label: 'Off', icon: MailMinus },
	] as const;
	let provider = $state<(typeof providers)[number]['value']>(initial.email.provider ?? 'none');
	let accountId = $state(initial.email.cloudflareAccountId ?? '');
	let apiToken = $state('');
	let from = $state(initial.email.from ?? '');
	let apiKey = $state('');
	let host = $state(initial.email.smtpHost ?? '');
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
		const input: Record<string, unknown> = { provider };
		if (provider !== 'none') input.from = from;
		if (provider === 'resend' && apiKey) input.apiKey = apiKey;
		if (provider === 'cloudflare') {
			input.accountId = accountId;
			if (apiToken) input.apiToken = apiToken;
		}
		if (provider === 'smtp') Object.assign(input, { host, port, user: user || null, ...(password ? { password } : {}) });
		if (await act('update_email_settings', input, provider === 'none' ? 'Email turned off' : 'Email saved')) {
			apiKey = '';
			apiToken = '';
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

<div class="grid gap-5 xl:grid-cols-2" class:items-start={locked || provider !== 'none'}>
	<form class="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6" onsubmit={saveGeneral}>
		<div><h2 class="font-semibold">Workspace preferences</h2><p class="mt-1 text-xs leading-relaxed text-muted-foreground">Choose how dates, uploads and outgoing email work.</p></div>
		<div class="space-y-1">
			<Label>Domain</Label>
			<p class="text-sm">{data.general.domain}</p>
			<p class="text-xs text-muted-foreground">Change it on the server with <code>openroom-server set-domain</code>.</p>
		</div>
		<div class="space-y-2">
			<Label for="tz">Time zone</Label>
			<ChoiceSelect id="tz" class="w-full" bind:value={timeZone}
				options={[...new Set(['UTC', ...data.timeZones])].map((tz) => ({ value: tz, label: tz }))}
			/>
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
		<Button type="submit" class="mt-auto self-start">Save preferences</Button>
	</form>

	<form id="email" class="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6" onsubmit={saveEmail}>
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
			<fieldset>
				<legend class="mb-2 text-sm font-medium">Delivery provider</legend>
				<div class="grid grid-cols-2 gap-2">
					{#each providers as option (option.value)}
						<label class="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-sm font-medium hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/5 has-checked:text-primary has-focus-visible:ring-2 has-focus-visible:ring-ring">
							<span aria-hidden="true" class="flex size-5 shrink-0 items-center justify-center">
								{#if 'logo' in option}
									<img src={option.logo} alt="" class={option.value === 'resend' ? 'size-8 max-w-none shrink-0 dark:invert' : 'w-5'} />
								{:else}
									<option.icon class="size-4" />
								{/if}
							</span>
							{option.label}
							<input type="radio" name="email-provider" class="ml-auto shrink-0 accent-primary" value={option.value} bind:group={provider} />
						</label>
					{/each}
				</div>
			</fieldset>
			{#if provider !== 'none'}
				<div class="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
					<h3 class="font-medium">{provider === 'cloudflare' ? 'Set up Cloudflare Email Sending' : provider === 'resend' ? 'Set up Resend' : 'Connect your SMTP server'}</h3>
					<ol class="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground marker:font-medium">
						{#if provider === 'cloudflare'}
							<li>In Cloudflare, open Email Service → Email Sending and onboard your sending domain using Cloudflare DNS.</li>
							<li>Copy your account ID and create an API token for that account with <strong>Email Sending: Edit</strong> permission.</li>
							<li>Enter a sender on that domain and paste the account ID and token below.</li>
						{:else if provider === 'resend'}
							<li>In Resend, add your sending domain and verify the DNS records.</li>
							<li>Create an API key with sending access to that domain.</li>
							<li>Enter a sender on the verified domain and paste the key below.</li>
						{:else}
							<li>Copy the outgoing server, port and permitted sender from your mail provider.</li>
							<li>Enter its SMTP credentials. For Gmail, use your email address and an <a class="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">app password</a> with two-step verification enabled.</li>
						{/if}
					</ol>
					{#if provider === 'cloudflare'}<p class="text-xs leading-relaxed text-muted-foreground">Sending to investors requires Workers Paid unless their addresses are verified in your Cloudflare account. <a class="underline" href="https://developers.cloudflare.com/email-service/get-started/send-emails/" target="_blank" rel="noreferrer">Cloudflare setup guide</a></p>
					{:else if provider === 'resend'}<a class="text-xs underline" href="https://resend.com/domains" target="_blank" rel="noreferrer">Open Resend domains</a>{/if}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">With email off, share links manually. {data.email.configured ? 'Saving removes the saved email credentials.' : 'Set up a provider to send verification codes, invitations and password resets.'}</p>
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
			{:else if provider === 'cloudflare'}
				<div class="space-y-2">
					<Label for="cf-account">Cloudflare account ID</Label>
					<Input id="cf-account" required pattern={'[a-fA-F0-9]{32}'} title="32 hexadecimal characters" bind:value={accountId} />
				</div>
				<div class="space-y-2">
					<Label for="cf-token">Email Sending API token</Label>
					<Input id="cf-token" type="password" autocomplete="new-password" required={!(data.email.provider === 'cloudflare' && data.email.hasSecret && accountId === data.email.cloudflareAccountId)} placeholder={data.email.provider === 'cloudflare' && accountId === data.email.cloudflareAccountId ? 'Token saved' : ''} bind:value={apiToken} />
				</div>
			{:else if provider === 'smtp'}
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="space-y-2 sm:col-span-2">
						<Label for="host">Server</Label>
						<Input id="host" required placeholder="smtp.example.com" bind:value={host} />
					</div>
					<div class="space-y-2">
						<Label for="port">Port</Label>
						<Input id="port" type="number" min={1} max={65535} required bind:value={port} />
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
			<Button type="submit" class="mt-auto self-start">{provider === 'none' ? 'Save email preferences' : 'Save email'}</Button>
		{/if}
	</form>
	{#if data.email.configured && provider === data.email.provider}
		<form
			class="space-y-3 rounded-xl border bg-card p-5 sm:p-6 xl:col-start-2"
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

	<div class="mt-6 space-y-4 rounded-xl border bg-card p-5 sm:p-6">
		<h2 class="font-semibold">Workspace appearance</h2>
		<p class="text-sm text-muted-foreground">Shown on investor pages; each room can use its own instead.</p>
		<BrandingForm branding={data.branding} />
	</div>
