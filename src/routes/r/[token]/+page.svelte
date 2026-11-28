<script lang="ts">
	import { ArrowRight, Check, Download, LockKeyhole } from '@lucide/svelte';
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { brandStyle } from '#lib/brand.ts';
	import OpenRoomCredit from '#lib/components/OpenRoomCredit.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { enhance } from '$app/forms';

	import type { PageProps } from './$types';

	let { data, form, appearance = false }: Pick<PageProps, 'data' | 'form'> & { appearance?: boolean } = $props();
	let busy = $state(false);
	let wait = $state(untrack(() => data.resendIn));
	let timer: ReturnType<typeof setInterval> | null = null;
	let code = $state('');
	let codeForm = $state<HTMLFormElement>();
	const codeLength = 6;

	function focusFirst() {
		document.querySelector<HTMLElement>('main input:not([type=hidden]):not([type=checkbox])')?.focus();
	}

	function focusInvalid() {
		const id = form && 'field' in form ? form.field : undefined;
		const target = id ? document.getElementById(id) : null;
		if (target) target.focus();
		else if (!document.querySelector('[role=alert]')) focusFirst();
	}

	onMount(() => {
		if (!appearance) focusFirst();
	});

	$effect(() => {
		if (appearance) return;
		wait = data.resendIn;
		if (timer) clearInterval(timer);
		timer = setInterval(() => (wait = Math.max(0, wait - 1)), 1000);
	});
	onDestroy(() => timer && clearInterval(timer));

	const submit = ({ cancel }: { cancel: () => void }) => {
		if (appearance) {
			cancel();
			return;
		}
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
				await tick();
				focusInvalid();
			} finally {
				busy = false;
			}
		};
	};

	function setCode(value: string) {
		code = value.replace(/\D/g, '').slice(0, codeLength);
		if (code.length === codeLength && !busy && !appearance) codeForm?.requestSubmit();
	}

	function scrollable(node: HTMLElement) {
		const update = () => {
			if (node.scrollHeight > node.clientHeight + 1) node.tabIndex = 0;
			else node.removeAttribute('tabindex');
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}

	const errorId = 'gate-error';
	const steps = $derived(data.steps ?? ['email']);
	const stepIndex = $derived(data.stepIndex ?? 0);
	const firstStep = $derived(stepIndex === 0);
	const records = $derived(data.records ?? ['Which pages you view and for how long']);
	const invalid = (id: string) => {
		if (!form?.error) return false;
		if (form && 'missing' in form && Array.isArray(form.missing)) return form.missing.includes(id);
		return form && 'field' in form ? form.field === id : false;
	};
	const describe = (id: string) => (invalid(id) ? errorId : undefined);
	const labels: Record<string, string> = { password: 'Password', email: 'Your email', code: 'Email code', fields: 'About you', nda: 'NDA' };
	const plan: Record<string, string> = {
		password: 'Enter the password from your invitation',
		email: 'Enter your email',
		code: 'Confirm it with the code we email you',
		fields: 'Answer a few short questions',
		nda: 'Read and accept the NDA',
	};
	const titles: Record<string, string> = { password: 'A private invitation.', email: 'Welcome to the room.', code: 'Check your inbox.', fields: 'A quick introduction.', nda: 'Before you step inside.' };
	const descriptions: Record<string, string> = { password: 'Enter the password shared with your invitation.', email: 'Enter your email to access the documents shared with you.', code: 'Confirm your email with the six-digit code.', fields: 'Let the team know a little about you.', nda: 'Please review and accept the confidentiality agreement.' };
</script>

<svelte:head><title>{labels[data.step] ?? 'Sign in'} · {data.roomName}</title></svelte:head>

{#snippet recordsNote()}
	<div class="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
		<p class="mb-1 font-medium text-foreground">What this room records</p>
		<ul class="flex list-disc flex-col gap-0.5 pl-4">{#each records as fact (fact)}<li>{fact}</li>{/each}</ul>
	</div>
{/snippet}

<div class="investor-brand min-h-screen bg-muted/30" style={brandStyle(data.branding.accentColor)}>
<main class="mx-auto grid min-h-[92dvh] max-w-5xl items-center gap-10 px-4 py-10 sm:px-5 md:grid-cols-[minmax(0,1fr)_420px] md:gap-16">
	<section class="hidden min-w-0 md:block" aria-label="Your steps">
		<span class="mb-8 flex size-14 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5 text-primary"><LockKeyhole class="size-6" strokeWidth={1.4} /></span>
		<p class="mb-3 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">A private invitation</p>
		<h1 class="break-words text-[44px] leading-[1.15] font-semibold tracking-[-0.045em]">{data.roomName}</h1>
		{#if data.sharedBy}<p class="mt-3 text-sm text-muted-foreground">Shared by {data.sharedBy}</p>{/if}
		<ol class="mt-8 flex max-w-sm flex-col gap-3 text-sm">
			{#each steps as step, i (step)}
				<li class="flex items-center gap-3" aria-current={i === stepIndex ? 'step' : undefined}>
					<span class={['flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums', i < stepIndex ? 'border-primary bg-primary text-primary-foreground' : i === stepIndex ? 'border-primary text-primary' : 'text-muted-foreground']}>
						{#if i < stepIndex}<Check class="size-3.5" /><span class="sr-only">Done:</span>{:else}{i + 1}{/if}
					</span>
					<span class={i === stepIndex ? 'font-medium' : 'text-muted-foreground'}>{plan[step]}</span>
				</li>
			{/each}
			<li class="flex items-center gap-3 text-muted-foreground">
				<span class="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed"><ArrowRight class="size-3.5" /></span>
				<span>Open the documents</span>
			</li>
		</ol>
	</section>
	<Card.Root class="w-full max-w-md justify-self-center border py-7 shadow-sm">
		<Card.Header>
			{#if data.branding.logoUrl}<img src={data.branding.logoUrl} alt="" class="mb-2 h-12 w-auto self-start object-contain" />{/if}
			<p class="mb-1 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase md:hidden">{data.roomName}</p>
			{#if data.sharedBy}<p class="mb-3 text-xs text-muted-foreground">Shared by {data.sharedBy}</p>{/if}
			{#if steps.length > 1}<p class="mb-1 text-xs font-medium text-primary">Step {stepIndex + 1} of {steps.length}</p>{/if}
			<Card.Title class="text-[25px] font-semibold tracking-tight">{titles[data.step] ?? data.roomName}</Card.Title><Card.Description class="mt-2 text-sm leading-relaxed">{descriptions[data.step]}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-5">
			{#if data.timedOut}
				<p class="rounded-md bg-muted p-3 text-sm" role="status">Your sign-in timed out. {data.step === 'email' ? 'Enter your email again.' : 'Start again.'}</p>
			{/if}
			{#if data.step === 'password'}
				<form method="POST" action="?/password" class="flex flex-col gap-5" use:enhance={submit}>
					<div class="flex flex-col gap-2">
						<Label for="password">Password</Label>
						<Input id="password" name="password" type="password" autocomplete="current-password" required aria-describedby={describe('password')} aria-invalid={invalid('password') || undefined} />
					</div>
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					<Button type="submit" size="lg" class="w-full" disabled={busy || appearance}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
			{:else if data.step === 'email'}
				<form method="POST" action="?/email" class="flex flex-col gap-5" use:enhance={submit}>
					<div class="flex flex-col gap-2">
						<Label for="email">Your email</Label>
						<Input id="email" readonly={appearance} name="email" type="email" autocomplete="email" required aria-describedby={describe('email')} aria-invalid={invalid('email') || undefined} />
					</div>
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					<Button type="submit" size="lg" class="w-full" disabled={busy || appearance}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
			{:else if data.step === 'code'}
				<p class="text-sm">If this email has access, we sent a code to <strong class="[overflow-wrap:anywhere]">{data.email}</strong>.</p>
				<form bind:this={codeForm} method="POST" action="?/code" class="flex flex-col gap-5" use:enhance={submit}>
					<div class="flex flex-col gap-2">
						<Label for="code">Six-digit code</Label>
						<Input
							id="code"
							aria-describedby={['code-help', describe('code')].filter(Boolean).join(' ')}
							aria-invalid={invalid('code') || undefined}
							name="code"
							inputmode="numeric"
							pattern={`[0-9]{${codeLength}}`}
							autocomplete="one-time-code"
							maxlength={codeLength}
							class="text-lg tracking-widest"
							required
							value={code}
							oninput={(event) => setCode(event.currentTarget.value)}
							onpaste={(event) => { const text = event.clipboardData?.getData('text'); if (text) { event.preventDefault(); setCode(text); } }}
						/>
						<p id="code-help" class="text-xs text-muted-foreground">The code is valid for {data.codeMinutes ?? 10} minutes. Not in your inbox? Check spam or promotions.</p>
					</div>
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					{#if form?.notice}<p class="text-sm" role="status">{form.notice}</p>{/if}
					<Button type="submit" size="lg" class="w-full" disabled={busy || appearance}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
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
							<Input id="field-{i}" name="field-{i}" maxlength={300} required={field.required} aria-describedby={describe(`field-${i}`)} aria-invalid={invalid(`field-${i}`) || undefined} />
						</div>
					{/each}
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					<Button type="submit" size="lg" class="w-full" disabled={busy || appearance}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
			{:else if data.step === 'nda'}
				<h2 class="font-medium">Non-disclosure agreement</h2>
				{#if data.ndaChanged}<p class="rounded-md bg-muted p-3 text-sm">The NDA has changed since you accepted it.</p>{/if}
				<section class="md rounded-lg border bg-muted/25 p-4 text-sm leading-relaxed [overflow-wrap:anywhere] sm:max-h-96 sm:overflow-y-auto" aria-label="Non-disclosure agreement text" {@attach scrollable}>
					{@html data.ndaHtml}
				</section>
				<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					{#if data.ndaDate}<p class="text-xs text-muted-foreground">Version of {new Date(data.ndaDate).toISOString().slice(0, 10)}</p>{/if}
					{#if data.ndaCopyHref}<Button href={data.ndaCopyHref} variant="link" size="sm" class="px-0" download><Download data-icon="inline-start" />Download a copy</Button>{/if}
				</div>
				<form method="POST" action="?/nda" class="flex flex-col gap-5" use:enhance={submit}>
					<input type="hidden" name="version" value={data.ndaVersionId} />
					<div class="flex flex-col gap-2">
						<Label for="name">Your full name</Label>
						<Input id="name" name="name" autocomplete="name" maxlength={120} required aria-describedby={describe('name')} aria-invalid={invalid('name') || undefined} />
					</div>
					<label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md text-sm">
						<input id="accept" type="checkbox" name="accept" required class="size-5 shrink-0 accent-primary" aria-describedby={describe('accept')} aria-invalid={invalid('accept') || undefined} />
						I have read and agree to this NDA
					</label>
					{#if form?.error}<p id={errorId} class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
					<Button type="submit" size="lg" class="w-full" disabled={busy || appearance}>{busy ? 'Please wait…' : 'Continue'}<ArrowRight data-icon="inline-end" /></Button>
				</form>
			{/if}
			{#if firstStep}{@render recordsNote()}{/if}
		</Card.Content>
	</Card.Root>
</main>
<p class="pb-6 text-center text-xs text-muted-foreground"><OpenRoomCredit /></p>
</div>
