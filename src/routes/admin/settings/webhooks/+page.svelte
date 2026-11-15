<script lang="ts">
	import { Braces, MessageSquare, Pause, Play, Send, SlidersHorizontal, Trash2, Webhook } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { act, attempt, copyText } from '#lib/admin/op.ts';
	import WebhookEvents from '#lib/admin/WebhookEvents.svelte';
	import When from '#lib/admin/When.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { data } = $props();
	let url = $state('');
	let format = $state<'generic' | 'slack'>('slack');
	let events = $state<string[] | null>(null);
	let error = $state('');
	let adding = $state(false);
	let secret = $state<string | null>(null);
	let editing = $state<(typeof data.webhooks)[number] | null>(null);
	let editEvents = $state<string[] | null>(null);
	let saving = $state(false);
	let editError = $state('');
	let testing = $state<string[]>([]);
	const formats = [
		{ value: 'slack', label: 'Slack', icon: MessageSquare },
		{ value: 'generic', label: 'Signed JSON', icon: Braces },
	] as const;

	async function add(event: SubmitEvent) {
		event.preventDefault();
		if (adding || events?.length === 0) return;
		adding = true;
		error = '';
		const r = await attempt<{ secret: string; format: string }>('create_webhook', { url, format, events }, 'Webhook added');
		adding = false;
		if (!r.ok) {
			error = r.error;
			return;
		}
		url = '';
		events = null;
		secret = r.data.format === 'generic' ? r.data.secret : null;
	}

	function edit(hook: (typeof data.webhooks)[number]) {
		editEvents = hook.events ? [...hook.events] : null;
		editError = '';
		editing = hook;
	}

	async function saveEvents() {
		if (!editing || saving || editEvents?.length === 0) return;
		saving = true;
		const r = await attempt('update_webhook', { webhookId: editing.id, events: editEvents }, 'Webhook events saved');
		saving = false;
		if (r.ok) editing = null;
		else editError = r.error;
	}

	async function test(id: string) {
		if (testing.includes(id)) return;
		testing = [...testing, id];
		const r = await act<{ sent: boolean; status: number; error: string | null }>('test_webhook', { webhookId: id });
		testing = testing.filter((item) => item !== id);
		if (!r) return;
		if (r.sent) toast.success(`Delivered (HTTP ${r.status})`);
		else toast.error(r.error ?? 'Delivery failed');
	}
</script>

<svelte:head><title>Webhooks · Settings · OpenRoom</title></svelte:head>

<div class="mb-5">
	<h2 class="text-lg font-semibold">Webhooks</h2>
	<p class="mt-1 text-sm text-muted-foreground">Send workspace events to a Slack channel or an HTTPS endpoint you manage.</p>
</div>

<div class="grid items-start gap-5 xl:grid-cols-2">
	<form onsubmit={add} class="min-w-0 rounded-xl border bg-card">
		<div class="border-b px-5 py-4"><h3 class="font-semibold">Add a destination</h3></div>
		<fieldset disabled={adding} class="grid min-w-0 gap-5 p-5">
			<fieldset>
				<legend class="mb-2 text-sm font-medium">Delivery format</legend>
				<div class="grid grid-cols-2 gap-2">
					{#each formats as item (item.value)}
						<label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium has-checked:border-primary has-checked:bg-primary/5 has-checked:text-primary has-focus-visible:ring-2 has-focus-visible:ring-ring">
							<item.icon aria-hidden="true" class="size-4" />{item.label}
							<input type="radio" name="format" value={item.value} bind:group={format} class="ml-auto accent-primary" />
						</label>
					{/each}
				</div>
			</fieldset>
			<div class="grid gap-2">
				<Label for="wh-url">{format === 'slack' ? 'Incoming webhook URL' : 'Endpoint URL'}</Label>
				<Input id="wh-url" type="url" required placeholder={format === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://example.com/webhooks/openroom'} bind:value={url} aria-describedby="wh-url-help" />
				<p id="wh-url-help" class="text-xs leading-relaxed text-muted-foreground">{format === 'slack' ? 'Paste the incoming webhook URL for the Slack channel that should receive messages.' : 'Use a public HTTPS endpoint. OpenRoom provides a signing secret when you add it.'}</p>
			</div>
			<WebhookEvents catalog={data.noticeEvents} bind:events />
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<Button type="submit" disabled={adding || events?.length === 0} class="justify-self-start">{adding ? 'Adding…' : 'Add webhook'}</Button>
		</fieldset>
	</form>

	<section aria-labelledby="destinations-title" class="min-w-0 rounded-xl border bg-card">
		<header class="flex items-center gap-2 border-b px-5 py-4"><h3 id="destinations-title" class="font-semibold">Destinations</h3><span class="text-sm tabular-nums text-muted-foreground">{data.webhooks.length}</span></header>
		{#if data.webhooks.length === 0}
			<div class="flex flex-col items-center px-6 py-12 text-center">
				<span class="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted"><Webhook aria-hidden="true" class="size-5 text-muted-foreground" /></span>
				<p class="text-sm font-medium">No destinations yet</p>
				<p class="mt-1 max-w-64 text-sm text-muted-foreground">Add a webhook to send a test and see its latest delivery result here.</p>
			</div>
		{:else}
			<ul class="divide-y">
				{#each data.webhooks as hook (hook.id)}
					<li class="grid gap-3 p-5">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0"><p class="font-semibold [overflow-wrap:anywhere]">{hook.host}</p>
								<p class="mt-1 text-xs text-muted-foreground">{hook.format === 'slack' ? 'Slack' : 'Signed JSON'} · {hook.events === null ? 'All events' : hook.events.length === 1 ? '1 selected event' : `${hook.events.length} selected events`}</p>
							</div>
							<Badge variant={hook.enabled ? 'secondary' : 'outline'}>{hook.enabled ? 'Active' : 'Paused'}</Badge>
						</div>
						<div class="border-l-2 pl-3 text-xs leading-relaxed">
							<p class="font-medium">{hook.lastError ? 'Delivery failed' : hook.lastSentAt ? 'Delivered' : 'No deliveries yet'}{hook.lastStatus ? ` · HTTP ${hook.lastStatus}` : ''}</p>
							{#if hook.lastSentAt}<When at={hook.lastSentAt} timeZone={data.timeZone} />{/if}
							{#if hook.lastError}<p class="text-destructive [overflow-wrap:anywhere]">{hook.lastError}</p>{/if}
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<Button variant="outline" size="sm" disabled={testing.includes(hook.id)} onclick={() => test(hook.id)}><Send />{testing.includes(hook.id) ? 'Sending…' : 'Send test'}</Button>
							<Button variant="ghost" size="sm" onclick={() => edit(hook)}><SlidersHorizontal />Edit events</Button>
							<Button variant="ghost" size="sm" onclick={() => act('update_webhook', { webhookId: hook.id, enabled: !hook.enabled })}>
								{#if hook.enabled}<Pause />Pause{:else}<Play />Resume{/if}
							</Button>
							{#snippet deleteIcon()}<Trash2 aria-hidden="true" />{/snippet}
							<DangerAction icon={deleteIcon} operation="delete_webhook" input={{ webhookId: hook.id }} label="Delete" confirmLabel="Delete webhook" title={`Delete the webhook to ${hook.host}?`} success="Webhook deleted" />
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<Dialog.Root open={!!editing} onOpenChange={(open) => { if (!open && !saving) editing = null; }}>
	<Dialog.Content class="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0">
		<Dialog.Header class="border-b p-5"><Dialog.Title>Edit webhook events</Dialog.Title><Dialog.Description class="[overflow-wrap:anywhere]">{editing?.host}</Dialog.Description></Dialog.Header>
		<div class="min-h-0 overflow-y-auto p-5"><WebhookEvents catalog={data.noticeEvents} bind:events={editEvents} />{#if editError}<p class="mt-3 text-sm text-destructive" role="alert">{editError}</p>{/if}</div>
		<Dialog.Footer class="border-t p-4"><Button variant="outline" disabled={saving} onclick={() => (editing = null)}>Cancel</Button><Button disabled={saving || editEvents?.length === 0} onclick={saveEvents}>{saving ? 'Saving…' : 'Save events'}</Button></Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={!!secret} onOpenChange={(open) => { if (!open) secret = null; }}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>Copy your signing secret</Dialog.Title><Dialog.Description>This secret is shown once. Use it to verify deliveries at your endpoint.</Dialog.Description></Dialog.Header>
		<div class="flex min-w-0 gap-2"><Input readonly value={secret ?? ''} class="font-mono" aria-label="Signing secret" /><Button variant="outline" onclick={() => secret && copyText(secret)}>Copy</Button></div>
		<p class="text-xs leading-relaxed text-muted-foreground">Verify the HMAC-SHA256 of the timestamp, a period and the raw request body using the X-OpenRoom-Timestamp and X-OpenRoom-Signature headers.</p>
		<Dialog.Footer><Button onclick={() => (secret = null)}>Done</Button></Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
