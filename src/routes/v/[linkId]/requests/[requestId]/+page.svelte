<script lang="ts">
	import { CheckCircle2, LockKeyhole, Upload } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { formatBytes } from '#lib/admin/op.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import DueDate from '#lib/viewer/DueDate.svelte';
	import LocalTime from '#lib/viewer/LocalTime.svelte';
	import RequestStatus from '#lib/viewer/RequestStatus.svelte';
	import { beforeNavigate, invalidateAll } from '$app/navigation';

	let { data } = $props();
	type Item = { key: number; name: string; size: number; file: File; progress: number; state: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled'; error: string; controller: AbortController };
	let items = $state<Item[]>([]);
	let message = $state<{ ok: boolean; text: string } | null>(null);
	let dragging = $state(false);
	let closed = $state(false);
	let running = false;
	let nextKey = 0;
	let receipt = $state<{ id: string; name: string; size: number; uploadedAt: number; late: boolean } | null>(null);
	const latestReceipt = $derived(receipt ?? data.uploads[0] ?? null);
	const previousUploads = $derived(data.uploads.filter((upload) => upload.id !== latestReceipt?.id));
	const status = $derived(data.request.closedAt || closed ? 'Closed' : data.uploads.length || receipt ? 'Uploaded' : 'Action needed');
	const busy = $derived(items.some((item) => item.state === 'queued' || item.state === 'uploading'));
	let input = $state<HTMLInputElement>();
	const base = $derived(`/v/${data.linkId}/requests/${data.request.id}`);

	const requestScope = $derived(`${data.readingScope}:${data.request.id}`);
	let controller = new AbortController();
	$effect(() => {
		void requestScope;
		untrack(() => { controller = new AbortController(); items = []; message = null; receipt = null; closed = false; dragging = false; running = false; });
		const active = controller;
		return () => active.abort();
	});

	function put(url: string, item: Item, signal: AbortSignal) {
		return new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', url);
			xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
			signal.addEventListener('abort', () => xhr.abort(), { once: true });
			xhr.setRequestHeader('content-type', 'application/octet-stream');
			xhr.upload.onprogress = (e) => { if (e.lengthComputable) item.progress = e.loaded / e.total; };
			xhr.onload = () => {
				if (xhr.status === 200) return resolve();
				let reason: unknown;
				try { reason = JSON.parse(xhr.responseText)?.error?.message; } catch {}
				if (xhr.status === 404 && reason === 'This file request is no longer available to this session.') closed = true;
				reject(new Error(typeof reason === 'string' ? reason : 'The upload failed. Try again.'));
			};
			xhr.onerror = () => reject(new Error('The connection broke. Try again.'));
			xhr.send(item.file);
		});
	}

	async function post(path: string, body: unknown, signal: AbortSignal) {
		const r = await fetch(path, {
			method: 'POST',
			signal,
			headers: { accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});
		const json = await r.json().catch(() => null);
		signal.throwIfAborted();
		const reason = json?.error ?? json?.message;
		if (r.status === 404 && reason === 'This request is closed or no longer open to you.') closed = true;
		if (!r.ok) throw new Error(reason ?? 'Something went wrong.');
		return json;
	}

	function add(files: FileList | null | undefined) {
		if (!files?.length || closed || data.request.closedAt) return;
		message = null;
		const scope = controller.signal;
		for (const file of files) {
			const item: Item = { key: nextKey++, name: file.name, size: file.size, file, progress: 0, state: 'queued', error: '', controller: new AbortController() };
			if (file.size > data.request.maxSize) {
				item.state = 'failed';
				item.error = `Larger than ${formatBytes(data.request.maxSize)}.`;
			}
			scope.addEventListener('abort', () => item.controller.abort(), { once: true });
			items.push(item);
		}
		void run(scope);
	}

	async function run(scope: AbortSignal) {
		if (running) return;
		running = true;
		let received = 0;
		try {
			for (let item = items.find((i) => i.state === 'queued'); item && !scope.aborted && !closed; item = items.find((i) => i.state === 'queued')) {
				const signal = item.controller.signal;
				const uploadBase = base;
				try {
					item.state = 'uploading';
					const started = await post(`${uploadBase}/upload`, { name: item.name, size: item.size }, signal);
					await put(started.url, item, signal);
					const done = await post(`${uploadBase}/finish`, { uploadId: started.uploadId }, signal);
					item.state = 'done';
					item.progress = 1;
					receipt = done;
					received++;
				} catch (e) {
					if (scope.aborted) return;
					if (signal.aborted) item.state = 'cancelled';
					else {
						item.state = 'failed';
						item.error = e instanceof Error ? e.message : 'The upload failed.';
					}
				}
			}
			if (closed) for (const item of items) if (item.state === 'queued') item.state = 'cancelled';
			if (received && !scope.aborted) await invalidateAll().catch(() => { if (!scope.aborted) message = { ok: true, text: 'Your files were received. Reload to refresh the upload list.' }; });
		} finally {
			if (!scope.aborted) running = false;
		}
	}

	function cancel(item: Item) {
		if (item.state === 'queued') item.state = 'cancelled';
		else item.controller.abort();
	}

	beforeNavigate((navigation) => {
		if (!busy) return;
		if (navigation.type === 'leave' || !confirm('Your uploads are still in progress. Leave and cancel them?')) navigation.cancel();
	});

	const label = (item: Item) => item.state === 'uploading' ? `Uploading ${Math.round(item.progress * 100)}%` : item.state === 'queued' ? 'Waiting' : item.state === 'done' ? 'Received' : item.state === 'cancelled' ? 'Cancelled' : item.error;
</script>

<svelte:head><title>{data.request.title} · {data.roomName}</title></svelte:head>

<div class="mx-auto flex max-w-xl flex-col gap-5">
	<a class="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline" href={latestReceipt ? `/v/${data.linkId}/requests?submitted=${data.request.id}` : `/v/${data.linkId}/requests`}>Back to requests</a>
	<div><RequestStatus {status} /><h1 class="mt-3 break-words text-xl font-semibold [overflow-wrap:anywhere]">{data.request.title}</h1></div>
	{#if latestReceipt}<section class="rounded-xl border bg-card p-4" aria-label="Submission receipt"><div class="flex items-center gap-2"><CheckCircle2 class="size-5 shrink-0 text-success-foreground" /><h2 class="font-semibold">Upload received</h2></div><p class="mt-3 break-words text-sm font-medium [overflow-wrap:anywhere]">{latestReceipt.name}</p><p class="mt-1 text-xs text-muted-foreground">{formatBytes(latestReceipt.size)} · <LocalTime at={latestReceipt.uploadedAt} />{latestReceipt.late ? ' · Received after the due date' : ''}</p><p class="mt-3 text-sm text-muted-foreground">Saved for the team. This confirms receipt, not review or approval.</p></section>{/if}
	{#if data.request.description}<p class="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{data.request.description}</p>{/if}
	<p class="text-sm text-muted-foreground">Up to {formatBytes(data.request.maxSize)} per file{#if data.request.dueAt && status !== 'Closed'}{' · '}<DueDate at={data.request.dueAt} />{/if}. Only the team running this room sees what you upload.</p>
	{#if status === 'Closed'}
        <div class="flex items-start gap-2 border-y py-3 text-sm text-muted-foreground" role="status"><LockKeyhole class="mt-0.5 size-4 shrink-0" /><p><span class="font-medium text-foreground">This request is closed.</span> No more files can be submitted.{#if !latestReceipt}{' '}You have no submissions for this request.{/if}</p></div>
	{:else}
		{#if latestReceipt}<Button variant="outline" class="min-h-11 self-start" onclick={() => input?.click()}><Upload data-icon="inline-start" />Add more files</Button>{:else}
		<button type="button" class="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card p-5 text-sm {dragging ? 'border-primary' : ''}" onclick={() => input?.click()} ondragover={(e) => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={(e) => { e.preventDefault(); dragging = false; add(e.dataTransfer?.files); }}>
			<Upload class="size-6 text-primary" />Choose files or drop them here
		</button>
		{/if}
		<input bind:this={input} type="file" multiple class="hidden" onchange={(e) => { add(e.currentTarget.files); e.currentTarget.value = ''; }} />
		{#if items.length}
			<ul class="divide-y rounded-xl border bg-card" aria-label="Uploads">
				{#each items as item (item.key)}
					<li class="flex flex-col gap-2 p-4">
						<div class="flex items-center gap-3">
							<span class="min-w-0 flex-1 break-words text-sm font-medium [overflow-wrap:anywhere]">{item.name}</span>
							{#if item.state === 'done'}<CheckCircle2 aria-hidden="true" class="size-4 shrink-0 text-success-foreground" />{/if}
							{#if item.state === 'queued' || item.state === 'uploading'}<Button variant="outline" size="sm" onclick={() => cancel(item)} aria-label="Cancel upload of {item.name}">Cancel</Button>{/if}
						</div>
						{#if item.state === 'uploading'}
							<div class="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Uploading {item.name}" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}><div class="h-full bg-primary transition-[width]" style="width: {item.progress * 100}%"></div></div>
						{/if}
						<span class="text-xs {item.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}" role={item.state === 'failed' ? 'alert' : undefined}>{formatBytes(item.size)} · {label(item)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
	{#if message}<p class="text-sm {message.ok ? '' : 'text-destructive'}" role="status">{message.text}</p>{/if}

    {#if previousUploads.length}<details class="rounded-xl border bg-card" aria-label="Previous submissions"><summary class="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">Previous submissions ({previousUploads.length})</summary><ul class="divide-y border-t">{#each previousUploads as upload (upload.id)}<li class="flex flex-col gap-2 p-4"><span class="break-words text-sm font-medium [overflow-wrap:anywhere]">{upload.name}</span><span class="text-xs text-muted-foreground"><LocalTime at={upload.uploadedAt} /> · {formatBytes(upload.size)}{upload.late ? ' · After the due date' : ''}</span></li>{/each}</ul></details>{/if}
</div>
