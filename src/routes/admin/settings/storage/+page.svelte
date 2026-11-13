<script lang="ts">
	import { ArrowRight, Cloud, HardDrive, RefreshCw, ShieldCheck } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import { act, attempt, formatBytes } from '#lib/admin/op.ts';
	import When from '#lib/admin/When.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	const saved = $derived(data.storage);
	let bucket = $state(untrack(() => data.storage.bucket ?? ''));
	let region = $state(untrack(() => data.storage.region ?? 'auto'));
	let endpoint = $state(untrack(() => data.storage.endpoint ?? ''));
	let forcePathStyle = $state(untrack(() => data.storage.forcePathStyle));
	let accessKeyId = $state('');
	let secretAccessKey = $state('');
	let busy = $state(false);
	let error = $state('');
	const locked = $derived(saved.source === 'env');
 let moveOpen = $state(false);
 let destination = $state<'disk' | 's3'>('s3');
 let moveBucket = $state('');
 let moveEndpoint = $state('');
 let moveRegion = $state('auto');
 let moveAccess = $state('');
 let moveSecret = $state('');
 let movePathStyle = $state(true);
 let moveConfirm = $state<ReturnType<typeof DangerAction>>();
 const moveTarget = $derived(destination === 'disk' ? { kind: 'disk' } : { kind: 's3', bucket: moveBucket, endpoint: moveEndpoint || null, region: moveRegion, forcePathStyle: movePathStyle, accessKeyId: moveAccess, secretAccessKey: moveSecret });
 $effect(() => {
  if (!saved.transfer.id && !saved.moving) return;
  const timer = setInterval(() => invalidateAll(), 3000);
  return () => clearInterval(timer);
 });
 async function reviewMove(event: SubmitEvent) { event.preventDefault(); await tick(); await moveConfirm?.start(); }
 async function queued() { moveOpen = false; moveAccess = moveSecret = ''; await invalidateAll(); }

	async function save(event: SubmitEvent) {
		event.preventDefault(); busy = true; error = '';
		try {
			const result = await attempt('update_storage_settings', { bucket, region, endpoint: endpoint || null, forcePathStyle, ...(accessKeyId ? { accessKeyId } : {}), ...(secretAccessKey ? { secretAccessKey } : {}) }, 'Storage checked and saved');
			if (result.ok) { accessKeyId = ''; secretAccessKey = ''; } else error = result.error;
		} finally { busy = false; }
	}
	async function check(kind: 'test_storage' | 'test_replication' | 'retry_storage_move') {
		busy = true;
		try { const result = await act<{ ok?: boolean; error?: string | null }>(kind, {}, kind === 'retry_storage_move' ? 'Move queued' : undefined); if (result?.error) error = result.error; else { error = ''; if (result?.ok) toast.success(kind === 'test_storage' ? 'Storage connection verified' : 'Database backup confirmed'); } } finally { busy = false; }
	}
</script>

<svelte:head><title>Storage & backups · OpenRoom</title></svelte:head>
<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
	<div class="flex min-w-0 flex-col gap-5">
		<Card.Root class="shadow-none"><Card.Header><div class="mb-3 flex items-center justify-between"><Cloud class="size-6 text-primary" strokeWidth={1.6} /><Badge variant="outline">{saved.configured ? 'S3 connected' : 'Optional'}</Badge></div><Card.Title class="text-base">A second home for your data</Card.Title><Card.Description>Store documents and continuous database backups in a private S3-compatible bucket. OpenRoom keeps working on local disk without it.</Card.Description></Card.Header><Card.Content>
			{#if locked}<Alert.Root class="mb-5"><ShieldCheck /><Alert.Description>Storage is configured by this server. Its settings are read only here.</Alert.Description></Alert.Root>{/if}
			<form class="flex flex-col gap-6" onsubmit={save}>
				<Field.Group class="gap-5">
					<Field.Field data-disabled={locked || saved.configured || !!saved.transfer.id}><Field.Label for="s3-bucket">Bucket name</Field.Label><Input id="s3-bucket" required placeholder="your-private-data-room" bind:value={bucket} disabled={locked || saved.configured || !!saved.transfer.id} /><Field.Description>{saved.configured ? 'Replace credentials here, or use Move storage below to change the bucket.' : 'Use a dedicated private bucket with no public access.'}</Field.Description></Field.Field>
					<Field.Field data-disabled={locked || saved.configured || !!saved.transfer.id}><Field.Label for="s3-endpoint">S3 endpoint</Field.Label><Input id="s3-endpoint" type="url" placeholder="https://s3.your-provider.com" bind:value={endpoint} disabled={locked || saved.configured || !!saved.transfer.id} /><Field.Description>Copy it from your storage provider. Leave it empty for AWS S3.</Field.Description></Field.Field>
					<Field.Field data-disabled={locked || saved.configured || !!saved.transfer.id}><Field.Label for="s3-region">Region</Field.Label><Input id="s3-region" required bind:value={region} disabled={locked || saved.configured || !!saved.transfer.id} /><Field.Description>Use the bucket’s region, or “auto” when your provider requires it.</Field.Description></Field.Field>
					<Field.Field data-disabled={locked || !!saved.transfer.id}><Field.Label for="s3-access">Access key ID</Field.Label><Input id="s3-access" type="password" autocomplete="off" required={!saved.configured} bind:value={accessKeyId} disabled={locked || !!saved.transfer.id} placeholder={saved.configured ? 'Saved securely · leave empty to keep it' : 'Paste your access key ID'} /></Field.Field>
					<Field.Field data-disabled={locked || !!saved.transfer.id}><Field.Label for="s3-secret">Secret access key</Field.Label><Input id="s3-secret" type="password" autocomplete="new-password" required={!saved.configured} bind:value={secretAccessKey} disabled={locked || !!saved.transfer.id} placeholder={saved.configured ? 'Saved securely · leave empty to keep it' : 'Paste your secret access key'} /><Field.Description>Keys are encrypted and are never shown again.</Field.Description></Field.Field>
					<Field.Field orientation="horizontal" data-disabled={locked || saved.configured || !!saved.transfer.id}><Switch id="s3-path-style" bind:checked={forcePathStyle} disabled={locked || saved.configured || !!saved.transfer.id} /><Field.Content><Field.Label for="s3-path-style">Path-style requests</Field.Label><Field.Description>Keep on for most S3-compatible providers.</Field.Description></Field.Content></Field.Field>
				</Field.Group>
				{#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
				<div class="flex flex-wrap gap-2">{#if !locked}<Button type="submit" disabled={busy || !!saved.transfer.id}>{busy ? 'Checking…' : saved.configured ? 'Check & save credentials' : 'Connect storage'}<ArrowRight data-icon="inline-end" /></Button>{/if}{#if saved.configured}<Button type="button" variant="outline" disabled={busy || !!saved.transfer.id} onclick={() => check('test_storage')}>Test storage</Button>{/if}</div>
			</form>
		</Card.Content></Card.Root>

  {#if saved.transfer.id}
   <Card.Root class="border-primary/30 shadow-none"><Card.Header><Card.Title class="text-sm">{saved.transfer.error ? 'Storage move paused' : 'Moving storage'}</Card.Title><Card.Description>Copying to {saved.transfer.target}. Existing documents remain available. Uploads resume after verification.</Card.Description></Card.Header><Card.Content class="space-y-4"><div role="status" class="text-sm tabular-nums">{saved.transfer.copied} of {saved.transfer.total} files verified</div><div role="progressbar" aria-label="Storage move" aria-valuenow={saved.transfer.copied} aria-valuemin={0} aria-valuemax={Math.max(1, saved.transfer.total)} class="h-1.5 overflow-hidden rounded-full bg-muted"><div class="h-full bg-primary transition-all" style:width="{saved.transfer.total ? Math.min(100, saved.transfer.copied / saved.transfer.total * 100) : 0}%"></div></div>{#if saved.transfer.error}<p role="alert" class="text-xs leading-relaxed text-destructive">{saved.transfer.error}</p>{/if}<div class="flex flex-wrap gap-2">{#if saved.transfer.error}<Button size="sm" variant="outline" disabled={busy} onclick={() => check('retry_storage_move')}>Retry move</Button>{/if}<Button size="sm" variant="ghost" disabled={busy} onclick={() => act('cancel_storage_move', {}, 'Storage move cancelled')}>Cancel move</Button></div></Card.Content></Card.Root>
  {:else if !locked}
   <Card.Root class="shadow-none"><Card.Header><Card.Title class="text-sm">Move storage</Card.Title><Card.Description>Switch to a different bucket{saved.configured ? ' or bring your files back to this server' : ''}. OpenRoom copies and verifies retained files before switching.</Card.Description></Card.Header><Card.Content class="space-y-4"><p class="text-xs leading-relaxed text-muted-foreground">Uploads pause during the move. Keep the original bucket for at least 30 days so earlier backups remain recoverable.</p><Button variant="outline" size="sm" onclick={() => { destination = saved.configured ? 'disk' : 's3'; moveOpen = true; }}>Choose destination</Button></Card.Content></Card.Root>
  {/if}
		{#if saved.configured}<Card.Root class="shadow-none"><Card.Header><Card.Title class="text-sm">Database replication</Card.Title><Card.Description>{data.system?.replication.ok ? 'Litestream recently confirmed that your database reached the replica.' : 'A running process does not mean a successful backup. Check that the latest changes reached the replica.'}</Card.Description></Card.Header><Card.Content class="flex flex-col gap-3"><p class="text-xs text-muted-foreground">Last confirmed: <When at={data.system?.replication.lastOkAt ?? null} timeZone={data.timeZone} /></p>{#if data.system?.replication.error}<p class="text-xs text-destructive">{data.system.replication.error}</p>{/if}<Button variant="outline" class="w-fit" size="sm" disabled={busy || !!saved.transfer.id} onclick={() => check('test_replication')}><RefreshCw data-icon="inline-start" />Check replication now</Button></Card.Content></Card.Root>{/if}
	</div>
	<aside class="flex flex-col gap-5">
		<Card.Root class="gap-0 py-0 shadow-none"><Card.Header class="px-5 pt-5 pb-4"><Card.Title class="text-sm">Storage at a glance</Card.Title></Card.Header><Card.Content class="flex flex-col gap-4 px-5 pb-5"><div class="flex items-center gap-3"><HardDrive class="size-4 text-muted-foreground" /><div class="flex-1"><p class="text-xs">On this server</p><p class="mt-1 text-[10px] text-muted-foreground">{saved.diskObjects} files</p></div><span class="text-xs font-medium">{formatBytes(saved.diskBytes)}</span></div><div class="flex items-center gap-3"><Cloud class="size-4 text-primary" /><div class="flex-1"><p class="text-xs">In your bucket</p><p class="mt-1 text-[10px] text-muted-foreground">{saved.s3Objects} files</p></div><span class="text-xs font-medium">{formatBytes(saved.s3Bytes)}</span></div>{#if saved.moving}<p role="status" class="text-xs leading-relaxed text-muted-foreground">Copying existing files. Keep this server until the move finishes.</p>{/if}{#if saved.moveError}<p class="text-xs text-destructive">{saved.moveError}</p><Button variant="outline" size="sm" disabled={busy || !!saved.transfer.id} onclick={() => check('retry_storage_move')}>Retry file move</Button>{/if}<p class="border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">A disk copy is removed only after the bucket copy’s size and SHA-256 match.</p></Card.Content></Card.Root>
		<Card.Root class="gap-0 py-0 shadow-none"><Card.Header class="px-5 pt-5 pb-3"><Card.Title class="text-sm">Before you connect</Card.Title></Card.Header><Card.Content class="px-5 pb-5"><ol class="flex list-decimal flex-col gap-3 pl-4 text-xs leading-relaxed text-muted-foreground"><li>Create a private bucket used only by this OpenRoom install.</li><li>Create an application key with list, read, write, delete and multipart permissions.</li><li>Keep your OpenRoom secret key somewhere safe. You need it to restore on a new server.</li></ol><p class="mt-4 text-[11px] leading-relaxed text-muted-foreground">Database snapshots keep 30 days of history. Do not add lifecycle rules that delete files or backups sooner.</p></Card.Content></Card.Root>
	</aside>
</div>

<Dialog.Root bind:open={moveOpen}>
 <Dialog.Content class="max-h-[90dvh] overflow-y-auto">
  <Dialog.Header><Dialog.Title>Move your storage</Dialog.Title><Dialog.Description>Documents stay available. New uploads pause until every retained file has been verified.</Dialog.Description></Dialog.Header>
  <form class="space-y-5" onsubmit={reviewMove}>
   <Field.Field><Field.Label for="move-destination">Destination</Field.Label><select id="move-destination" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={destination}>{#if saved.configured}<option value="disk">This server’s local disk</option>{/if}<option value="s3">A new S3-compatible bucket</option></select></Field.Field>
   {#if destination === 's3'}
    <Field.Group class="gap-4">
     <Field.Field><Field.Label for="move-bucket">New private bucket</Field.Label><Input id="move-bucket" required bind:value={moveBucket} placeholder="openroom-new-bucket" /></Field.Field>
     <Field.Field><Field.Label for="move-endpoint">Endpoint</Field.Label><Input id="move-endpoint" type="url" bind:value={moveEndpoint} placeholder="https://s3.your-provider.com" /><Field.Description>Leave empty for AWS S3.</Field.Description></Field.Field>
     <Field.Field><Field.Label for="move-region">Region</Field.Label><Input id="move-region" required bind:value={moveRegion} /></Field.Field>
     <Field.Field><Field.Label for="move-access">Access key ID</Field.Label><Input id="move-access" required type="password" autocomplete="off" bind:value={moveAccess} /></Field.Field>
     <Field.Field><Field.Label for="move-secret">Secret access key</Field.Label><Input id="move-secret" required type="password" autocomplete="new-password" bind:value={moveSecret} /></Field.Field>
     <Field.Field orientation="horizontal"><Switch id="move-path" bind:checked={movePathStyle} /><Field.Content><Field.Label for="move-path">Path-style requests</Field.Label></Field.Content></Field.Field>
    </Field.Group>
   {:else}<p class="rounded-lg bg-muted/50 p-4 text-sm leading-relaxed">The server needs enough free disk space for every retained file. Database backups will then live on this server too.</p>{/if}
   <Dialog.Footer><Button type="submit">Review storage move</Button></Dialog.Footer>
  </form>
 </Dialog.Content>
</Dialog.Root>
<DangerAction bind:this={moveConfirm} operation="move_storage" input={{ target: moveTarget }} label="Move storage" title="Move storage and replication?" success="Storage move queued" showButton={false} onDone={queued} />
