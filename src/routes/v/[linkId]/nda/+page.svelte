<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { data, form } = $props();
</script>

<svelte:head><title>NDA · {data.roomName}</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6">
	<h1 class="text-xl font-semibold">Non-disclosure agreement</h1>
	{#if data.changed}<p class="rounded-md bg-muted p-3 text-sm">The NDA has changed since you accepted it.</p>{/if}
	<div class="md rounded-md border p-4 text-sm" role="document" aria-label="NDA">
		{@html data.ndaHtml}
	</div>
	<p class="text-xs text-muted-foreground">Version of {new Date(data.ndaDate).toISOString().slice(0, 10)}</p>
	<form method="POST" class="flex flex-col gap-4">
		<input type="hidden" name="version" value={data.ndaVersionId} />
		<div class="flex flex-col gap-2">
			<Label for="name">Your full name</Label>
			<Input class="min-h-11" id="name" name="name" autocomplete="name" maxlength={120} required />
		</div>
		<label class="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="accept" required /> I accept</label>
		{#if form?.error}<p class="text-sm text-destructive" role="alert">{form.error}</p>{/if}
		<Button type="submit" class="min-h-11 w-full sm:w-auto sm:self-start">Continue</Button>
	</form>
</div>
