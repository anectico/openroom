<script lang="ts">
	import { CheckCircle2, LockKeyhole, Upload } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { formatBytes } from '#lib/admin/op.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import DueDate from '#lib/viewer/DueDate.svelte';
	import LocalTime from '#lib/viewer/LocalTime.svelte';
	import RequestStatus from '#lib/viewer/RequestStatus.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let progress = $state<number | null>(null);
	let message = $state<{ ok: boolean; text: string } | null>(null);
	let dragging = $state(false);
	let closed = $state(false);
	let receipt = $state<{ id: string; name: string; size: number; uploadedAt: number; late: boolean } | null>(null);
	const latestReceipt = $derived(receipt ?? data.uploads[0] ?? null);
 const previousUploads = $derived(data.uploads.filter((upload) => upload.id !== latestReceipt?.id));
	const status = $derived(data.request.closedAt || closed ? 'Closed' : data.uploads.length || receipt ? 'Uploaded' : 'Action needed');
	let input = $state<HTMLInputElement>();
	const base = $derived(`/v/${data.linkId}/requests/${data.request.id}`);

	const requestScope = $derived(`${data.readingScope}:${data.request.id}`);
	let controller = new AbortController();
	$effect(() => {
		void requestScope;
		untrack(() => { controller = new AbortController(); progress = null; message = null; receipt = null; closed = false; dragging = false; });
		const active = controller;
		return () => active.abort();
	});

	function put(url: string, file: File, signal: AbortSignal) {
		return new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', url);
			xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
			signal.addEventListener('abort', () => xhr.abort(), { once: true });
			xhr.setRequestHeader('content-type', 'application/octet-stream');
			xhr.upload.onprogress = (e) => e.lengthComputable && (progress = e.loaded / e.total);
			xhr.onload = () => (xhr.status === 200 ? resolve() : reject(new Error('The upload failed. Try again.')));
			xhr.onerror = () => reject(new Error('The connection broke. Try again.'));
			xhr.send(file);
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
		if (r.status === 404) closed = true;
		if (!r.ok) throw new Error(json?.error ?? json?.message ?? 'Something went wrong.');
		return json;
	}

	async function send(file: File | undefined) {
		if (!file || progress !== null || closed || data.request.closedAt) return;
		message = null;
		if (file.size > data.request.maxSize) {
			message = { ok: false, text: `This file is larger than ${formatBytes(data.request.maxSize)}.` };
			return;
		}
		const signal = controller.signal;
		const uploadBase = base;
		try {
			progress = 0;
			const started = await post(`${uploadBase}/upload`, { name: file.name, size: file.size }, signal);
			await put(started.url, file, signal);
			const done = await post(`${uploadBase}/finish`, { uploadId: started.uploadId }, signal);
			receipt = done;
			message = null;
			await invalidateAll().catch(() => { if (signal.aborted) return; message = { ok: true, text: 'Your file was received. Reload to refresh the upload list.' }; });
		} catch (e) {
			if (signal.aborted) return;
			message = { ok: false, text: e instanceof Error ? e.message : 'The upload failed.' };
		} finally {
			if (!signal.aborted) progress = null;
		}
	}
</script>

<svelte:head><title>{data.request.title} · {data.roomName}</title></svelte:head>

<div class="mx-auto flex max-w-xl flex-col gap-5">
	<a class="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline" href={latestReceipt ? `/v/${data.linkId}/requests?submitted=${data.request.id}` : `/v/${data.linkId}/requests`}>Back to requests</a>
	<div><RequestStatus {status} /><h1 class="mt-3 break-words text-xl font-semibold [overflow-wrap:anywhere]">{data.request.title}</h1></div>
	{#if latestReceipt}<section class="rounded-xl border bg-card p-4" aria-label="Submission receipt"><div class="flex items-center gap-2"><CheckCircle2 class="size-5 shrink-0 text-success-foreground" /><h2 class="font-semibold">Upload received</h2></div><p class="mt-3 break-words text-sm font-medium [overflow-wrap:anywhere]">{latestReceipt.name}</p><p class="mt-1 text-xs text-muted-foreground">{formatBytes(latestReceipt.size)} · <LocalTime at={latestReceipt.uploadedAt} />{latestReceipt.late ? ' · Received after the due date' : ''}</p><p class="mt-3 text-sm text-muted-foreground">Saved for the team. This confirms receipt, not review or approval.</p></section>{/if}
	{#if data.request.description}<p class="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{data.request.description}</p>{/if}
	<p class="text-sm text-muted-foreground">Up to {formatBytes(data.request.maxSize)}{#if data.request.dueAt && status !== 'Closed'} · <DueDate at={data.request.dueAt} />{/if}. Only the team running this room sees what you upload.</p>
	{#if status === 'Closed'}
        <div class="flex items-start gap-2 border-y py-3 text-sm text-muted-foreground" role="status"><LockKeyhole class="mt-0.5 size-4 shrink-0" /><p><span class="font-medium text-foreground">This request is closed.</span> No more files can be submitted.{#if !latestReceipt}{' '}You have no submissions for this request.{/if}</p></div>
	{:else}
		{#if latestReceipt}<Button variant="outline" class="min-h-11 self-start" disabled={progress !== null} onclick={() => input?.click()}><Upload data-icon="inline-start" />{progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : 'Add another file'}</Button>{:else}
		<button type="button" class="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card p-5 text-sm {dragging ? 'border-primary' : ''}" disabled={progress !== null} onclick={() => input?.click()} ondragover={(e) => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={(e) => { e.preventDefault(); dragging = false; void send(e.dataTransfer?.files[0]); }}>
			<Upload class="size-6 text-primary" />{progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : 'Choose a file or drop it here'}
		</button>
 {/if}
		<input bind:this={input} type="file" class="hidden" onchange={(e) => { void send(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
	{/if}
	{#if message}<p class="text-sm {message.ok ? '' : 'text-destructive'}" role="status">{message.text}</p>{/if}

    {#if previousUploads.length}<details class="rounded-xl border bg-card" aria-label="Previous submissions"><summary class="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">Previous submissions ({previousUploads.length})</summary><ul class="divide-y border-t">{#each previousUploads as upload (upload.id)}<li class="flex flex-col gap-2 p-4"><span class="break-words text-sm font-medium [overflow-wrap:anywhere]">{upload.name}</span><span class="text-xs text-muted-foreground"><LocalTime at={upload.uploadedAt} /> · {formatBytes(upload.size)}{upload.late ? ' · After the due date' : ''}</span></li>{/each}</ul></details>{/if}
</div>
