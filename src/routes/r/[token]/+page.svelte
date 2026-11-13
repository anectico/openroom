<script lang="ts">
	import { ArrowRight, LockKeyhole, ShieldCheck } from '@lucide/svelte';
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { brandStyle } from '#lib/brand.ts';

	function focusFirst() {
		document.querySelector<HTMLElement>('main input:not([type=hidden]):not([type=checkbox])')?.focus();
	}

	onMount(focusFirst);

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let busy = $state(false);
	let wait = $state(untrack(() => data.resendIn));
	let timer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		wait = data.resendIn;
		if (timer) clearInterval(timer);
		timer = setInterval(() => (wait = Math.max(0, wait - 1)), 1000);
	});
	onDestroy(() => timer && clearInterval(timer));

	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
				await tick();
				if (!document.querySelector('[role=alert]')) focusFirst();
			} finally {
				busy = false;
			}
		};
	};
	const errorId = 'gate-error';
	const titles: Record<string, string> = { password: 'A private invitation.', email: 'Welcome to the room.', code: 'Check your inbox.', fields: 'A quick introduction.', nda: 'Before you step inside.' };
	const descriptions: Record<string, string> = { password: 'Enter the password shared with your invitation.', email: 'Enter your email to access the documents shared with you.', code: 'Confirm your email with the six-digit code.', fields: 'Let the team know a little about you.', nda: 'Please review and accept the confidentiality agreement.' };
</script>

<svelte:head><title>{data.roomName}</title></svelte:head>

<div class="investor-brand min-h-screen bg-muted/30" style={brandStyle(data.branding.accentColor)}>
<main class="mx-auto grid min-h-[92dvh] max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-[minmax(0,1fr)_420px] md:gap-16">
	<section class="hidden min-w-0 md:block"><span class="mb-8 flex size-14 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5 text-primary"><LockKeyhole class="size-6" strokeWidth={1.4} /></span><p class="mb-3 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">A private invitation</p><h1 class="break-words text-[44px] leading-[1.15] font-semibold tracking-[-0.045em]">{data.roomName}</h1><p class="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">The right documents. A shared understanding.<br />A space to move the conversation forward.</p><div class="mt-10 flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck class="size-4 text-primary" />Shared privately with you</div></section>
	<Card.Root class="w-full max-w-md justify-self-center border py-7 shadow-sm">
		<Card.Header>
			{#if data.branding.logoUrl}<img src={data.branding.logoUrl} alt="" class="mb-2 h-12 w-auto self-start object-contain" />{/if}
			<p class="mb-3 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase md:hidden">{data.roomName}</p><Card.Title class="text-[25px] font-semibold tracking-tight">{titles[data.step] ?? data.roomName}</Card.Title><Card.Description class="mt-2 text-sm leading-relaxed">{descriptions[data.step]}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-5">
			{#if data.step === 'password'}
				<form method="POST" action="?/password" class="flex flex-col gap-5" use:enhance={submit}>
					<div class="flex flex-col gap-2">
						<Label for="password">Password</Label>
						<Input id="password" name="password" type="password" autocomplete="current-password" required />
					</div>
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					<Button type="submit" class="min-h-11 w-full" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
			{:else if data.step === 'email'}
				<form method="POST" action="?/email" class="flex flex-col gap-5" use:enhance={submit}>
					<div class="flex flex-col gap-2">
						<Label for="email">Your email</Label>
						<Input id="email" name="email" type="email" autocomplete="email" required />
					</div>
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					<div class="flex flex-col gap-3">
						<Button type="submit" class="min-h-11 w-full" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
						<p class="text-xs text-muted-foreground">This room records which pages you view.</p>
					</div>
				</form>
				{#if data.welcomeHtml}<details class="rounded-lg border"><summary class="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium">Read the welcome</summary><div class="md break-words border-t p-3 text-sm [overflow-wrap:anywhere]">{@html data.welcomeHtml}</div></details>{/if}
			{:else if data.step === 'code'}
				<p class="text-sm">If this email has access, we sent a code to <strong>{data.email}</strong>.</p>
				<form method="POST" action="?/code" class="flex flex-col gap-5" use:enhance={submit}>
					<div class="flex flex-col gap-2">
						<Label for="code">Six-digit code</Label>
						<Input
							id="code"
							aria-describedby={form?.error ? errorId : undefined}
							aria-invalid={form?.error ? 'true' : undefined}
							name="code"
							inputmode="numeric"
							autocomplete="one-time-code"
							maxlength={12}
							class="text-lg tracking-widest"
							required
						/>
					</div>
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					{#if form?.notice}<p class="text-sm" role="status">{form.notice}</p>{/if}
					<Button type="submit" class="min-h-11 w-full" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
				<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
					<form method="POST" action="?/resend" use:enhance={submit}>
						<Button type="submit" variant="link" class="px-0" disabled={wait > 0 || busy}>
							{wait > 0 ? `Resend in ${wait}s` : 'Resend the code'}
						</Button>
					</form>
					<form method="POST" action="?/change" use:enhance={submit}>
						<Button type="submit" variant="link" class="px-0">Use a different email</Button>
					</form>
				</div>
			{:else if data.step === 'fields'}
				<form method="POST" action="?/fields" class="flex flex-col gap-5" use:enhance={submit}>
					{#each data.fields as field, i (i)}
						<div class="flex flex-col gap-2">
							<Label for="field-{i}">{field.label}{#if field.required}<span class="text-destructive" aria-hidden="true"> *</span><span class="sr-only"> (required)</span>{/if}</Label>
							<Input id="field-{i}" name="field-{i}" maxlength={300} required={field.required} />
						</div>
					{/each}
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					<Button type="submit" class="min-h-11 w-full" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
			{:else if data.step === 'nda'}
				<h2 class="font-medium">Non-disclosure agreement</h2>
				{#if data.ndaChanged}<p class="rounded-md bg-muted p-3 text-sm">The NDA has changed since you accepted it.</p>{/if}
				<div class="md max-h-72 overflow-y-auto rounded-lg border bg-muted/25 p-4 text-sm leading-relaxed" role="document" aria-label="NDA">
					{@html data.ndaHtml}
				</div>
				{#if data.ndaDate}
					<p class="text-xs text-muted-foreground">Version of {new Date(data.ndaDate).toISOString().slice(0, 10)}</p>
				{/if}
				<form method="POST" action="?/nda" class="flex flex-col gap-5" use:enhance={submit}>
					<input type="hidden" name="version" value={data.ndaVersionId} />
					<div class="flex flex-col gap-2">
						<Label for="name">Your full name</Label>
						<Input id="name" name="name" autocomplete="name" maxlength={120} required />
					</div>
					<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="accept" required /> I accept</label>
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					<Button type="submit" class="min-h-11 w-full" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</main>
{#if !data.branding.whiteLabel}<p class="pb-6 text-center text-xs text-muted-foreground">Powered by OpenRoom</p>{/if}
</div>
