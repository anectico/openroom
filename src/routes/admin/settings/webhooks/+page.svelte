<script lang="ts">
	import { toast } from 'svelte-sonner';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { act, attempt, copyText } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { data } = $props();
	let url = $state('');
	let format = $state<'generic' | 'slack'>('slack');
	let error = $state('');
	let secret = $state<string | null>(null);

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const r = await attempt<{ secret: string }>('create_webhook', { url, format }, 'Webhook added');
		if (!r.ok) {
			error = r.error;
			return;
		}
		error = '';
		url = '';
		secret = format === 'generic' ? r.data.secret : null;
	}

	async function test(id: string) {
		const r = await act<{ sent: boolean; status: number; error: string | null }>('test_webhook', { webhookId: id });
		if (!r) return;
		if (r.sent) toast.success(`Delivered (${r.status})`);
		else toast.error(`Not delivered: ${r.error}`);
	}
</script>

<svelte:head><title>Webhooks · Settings · OpenRoom</title></svelte:head>

<div class="max-w-3xl space-y-6">
	<p class="text-sm text-muted-foreground">
		Send every notice (first opens, NDA acceptances, questions, downloads, uploads, freezes) to Slack or your own
		system. Only https addresses on the public internet are accepted.
	</p>
	<form class="space-y-3 rounded-lg border bg-background p-6" onsubmit={add}>
		<div class="grid gap-3 sm:grid-cols-[1fr_12rem]">
			<div class="space-y-1">
				<Label for="wh-url">Address</Label>
				<Input id="wh-url" type="url" required placeholder="https://hooks.slack.com/services/…" bind:value={url} />
			</div>
			<div class="space-y-1">
				<Label for="wh-format">Format</Label>
				<select id="wh-format" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={format}>
					<option value="slack">Slack</option>
					<option value="generic">JSON, signed</option>
				</select>
			</div>
		</div>
		{#if format === 'slack'}
			<p class="text-xs text-muted-foreground">
				In Slack, create an app with an incoming webhook for the channel you want, then paste its address here.
			</p>
		{/if}
		{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
		<Button type="submit">Add webhook</Button>
	</form>
	{#if secret}
		<div class="space-y-2 rounded-lg border bg-background p-4">
			<p class="text-sm font-medium">Signing secret, shown only now</p>
			<div class="flex gap-2">
				<Input readonly value={secret} class="font-mono" aria-label="Signing secret" />
				<Button variant="outline" onclick={() => secret && copyText(secret)}>Copy</Button>
			</div>
			<p class="text-xs text-muted-foreground">
				Each request carries X-OpenRoom-Timestamp and X-OpenRoom-Signature: sha256=HMAC-SHA256(secret, "timestamp.body").
			</p>
		</div>
	{/if}
	{#if data.webhooks.length}
		<ul class="divide-y rounded-lg border bg-background">
			{#each data.webhooks as h (h.id)}
				<li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<div>
						<p class="font-medium">
							{h.host}
							<Badge variant="outline">{h.format === 'slack' ? 'Slack' : 'JSON'}</Badge>
							{#if !h.enabled}<Badge variant="secondary">Off</Badge>{/if}
						</p>
						<p class="text-xs {h.lastError ? 'text-destructive' : 'text-muted-foreground'}">
							{#if h.lastError}Last error: {h.lastError}{:else if h.lastSentAt}Last sent <When at={h.lastSentAt} timeZone={data.timeZone} />{:else}Nothing sent yet{/if}
						</p>
					</div>
					<div class="flex items-center gap-1">
						<Button variant="outline" size="sm" onclick={() => test(h.id)}>Send test</Button>
						<Button variant="ghost" size="sm" onclick={() => act('update_webhook', { webhookId: h.id, enabled: !h.enabled })}>
							{h.enabled ? 'Turn off' : 'Turn on'}
						</Button>
						<DangerAction
							operation="delete_webhook"
							input={{ webhookId: h.id }}
							label="Delete"
							confirmLabel="Delete webhook"
							title="Delete this webhook?"
							success="Webhook deleted"
						/>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
