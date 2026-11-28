<script lang="ts">
	import { Download } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { data, form } = $props();
</script>

<svelte:head><title>NDA · {data.roomName}</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6">
	<h1 class="text-xl font-semibold">Non-disclosure agreement</h1>
	{#if data.changed}<p class="rounded-md bg-muted p-3 text-sm">The NDA has changed since you accepted it.</p>{/if}
	<section class="md rounded-md border p-4 text-sm [overflow-wrap:anywhere]" aria-label="Non-disclosure agreement text">
		{@html data.ndaHtml}
	</section>
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
		<p class="text-xs text-muted-foreground">Version of {new Date(data.ndaDate).toISOString().slice(0, 10)}</p>
		<Button href="/v/{data.linkId}/nda/copy" variant="link" size="sm" class="px-0" download><Download data-icon="inline-start" />Download a copy</Button>
	</div>
	<form method="POST" class="flex flex-col gap-4">
		<input type="hidden" name="version" value={data.ndaVersionId} />
		<div class="flex flex-col gap-2">
			<Label for="name">Your full name</Label>
			<Input class="min-h-11" id="name" name="name" autocomplete="name" maxlength={120} required />
		</div>
		<label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" name="accept" required class="size-5 shrink-0 accent-primary" />I have read and agree to this NDA</label>
		{#if form?.error}<p class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
		<Button type="submit" size="lg" class="w-full sm:w-auto sm:self-start">Continue</Button>
	</form>
</div>
