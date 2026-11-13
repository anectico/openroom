<script lang="ts">
	import { ArrowDownToLine, ChevronRight, FileDown, FolderPlus, Home, Link, MoreHorizontal, Search, Upload, } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import DangerAction from '#lib/admin/DangerAction.svelte';
import FileIcon from '#lib/admin/FileIcon.svelte';
	import { act, attempt, formatBytes, formatDate, op } from '#lib/admin/op.ts';
	import PinnedDocuments from '#lib/admin/PinnedDocuments.svelte';
	import type { TreeNode } from '#lib/admin/types.ts';
	import { addDroppedUpload, addFolderUpload, uploads } from '#lib/admin/uploads.svelte.ts';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	const folders = $derived(room.tree.filter((n) => n.type === 'folder'));
	const selectClass =
		'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';

	let uploadInto = $state<string>('');
	let search = $state('');
	const visibleNodes = $derived(search.trim() ? room.tree.filter((node) => node.name.toLowerCase().includes(search.trim().toLowerCase())) : room.tree.filter((node) => node.parentId === (uploadInto || null)));
	const breadcrumb = $derived.by(() => {
		const out: TreeNode[] = [];
		for (let node = room.tree.find((n) => n.id === uploadInto); node; node = room.tree.find((n) => n.id === node?.parentId)) out.unshift(node);
		return out;
	});
	$effect(() => { if (uploadInto && !folders.some((folder) => folder.id === uploadInto)) uploadInto = ''; });

	let filesInput = $state<HTMLInputElement>();
	let folderInput = $state<HTMLInputElement>();
	let versionInput = $state<HTMLInputElement>();
	let versionFor = $state<string | null>(null);
	let dragging = $state(false);
	let readingDrop = $state(false);

	let importOpen = $state(false);
	let importUrl = $state('');
	let importName = $state('');
	let importSize = $state<number | undefined>();
	let importing = $state(false);
	let importError = $state('');
	async function importDocument(event: SubmitEvent) {
		event.preventDefault();
		importing = true;
		importError = '';
		try {
			await op('upload_from_url', { target: { kind: 'file', roomId: room.id, folderId: uploadInto || null }, name: importName, url: importUrl, ...(importSize ? { size: importSize } : {}) });
			await invalidateAll();
			importOpen = false;
			importUrl = importName = '';
			importSize = undefined;
			toast.success('Document imported');
		} catch (error) { importError = error instanceof Error ? error.message : 'The import failed.'; }
		finally { importing = false; }
	}

	let folderDialog = $state(false);
	let folderName = $state('');
	let folderParent = $state('');
	let dialogError = $state('');

	let deleting = $state<TreeNode | null>(null);
	let deleter = $state<ReturnType<typeof DangerAction>>();
	let renaming = $state<TreeNode | null>(null);
	let newName = $state('');
	let moving = $state<TreeNode | null>(null);
	let moveTo = $state('');

	let versionsOf = $state<TreeNode | null>(null);
	let versions = $state<
		{ version: number; originalName: string; size: number; createdAt: number; current: boolean; contentType: string }[]
	>([]);

	const kindLabel: Record<string, string> = { pdf: 'PDF', image: 'Image', video: 'Video', download: 'Download only' };

	const moveTargets = $derived.by(() => {
		const node = moving;
		if (node?.type !== 'folder') return folders;
		const blocked = descendants(node.id);
		return folders.filter((f) => !blocked.has(f.id));
	});

	function siblings(node: TreeNode) {
		return room.tree.filter((n) => n.parentId === node.parentId);
	}

	function descendants(id: string): Set<string> {
		const out = new Set([id]);
		for (const n of room.tree) if (n.type === 'folder' && n.parentId && out.has(n.parentId)) out.add(n.id);
		return out;
	}

	function pickFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		if (files.length) uploads.add(files, { kind: 'file', roomId: room.id, folderId: uploadInto || null });
	}

	async function pickFolder(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		if (!files.length) return;
		try {
			await addFolderUpload(files, room.id, uploadInto || null);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not create the folders.');
		}
	}

	function pickVersion(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file && versionFor) uploads.add([file], { kind: 'version', fileId: versionFor });
	}

	async function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (!canEdit || readingDrop || !event.dataTransfer) return;
		readingDrop = true;
		try {
			await addDroppedUpload(event.dataTransfer, room.id, uploadInto || null);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not read the dropped folder. Try Upload a folder.');
		} finally {
			readingDrop = false;
		}
	}

	async function createFolder(event: SubmitEvent) {
		event.preventDefault();
		const r = await attempt('create_folder', { roomId: room.id, name: folderName, parentId: folderParent || null }, 'Folder created');
		if (!r.ok) {
			dialogError = r.error;
			return;
		}
		folderDialog = false;
		folderName = '';
		dialogError = '';
	}

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		if (!renaming) return;
		const r =
			renaming.type === 'folder'
				? await attempt('update_folder', { folderId: renaming.id, name: newName }, 'Renamed')
				: await attempt('update_file', { fileId: renaming.id, title: newName }, 'Renamed');
		if (!r.ok) {
			dialogError = r.error;
			return;
		}
		renaming = null;
		dialogError = '';
	}

	async function move(event: SubmitEvent) {
		event.preventDefault();
		if (!moving) return;
		const r =
			moving.type === 'folder'
				? await attempt('update_folder', { folderId: moving.id, parentId: moveTo || null }, 'Moved')
				: await attempt('update_file', { fileId: moving.id, folderId: moveTo || null }, 'Moved');
		if (!r.ok) {
			dialogError = r.error;
			return;
		}
		moving = null;
		dialogError = '';
	}

	async function shift(node: TreeNode, by: number) {
		const list = siblings(node);
		const position = list.findIndex((n) => n.id === node.id) + by;
		if (position < 0 || position >= list.length) return;
		if (node.type === 'folder') await act('update_folder', { folderId: node.id, position });
		else await act('update_file', { fileId: node.id, position });
	}

	async function exportIndex(format: 'csv' | 'pdf') {
		try {
			const r = await op<{ downloadUrl: string }>('export_room_index', { roomId: room.id, format });
			location.href = r.downloadUrl;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'The index could not be made.');
		}
	}

	let roomZip = $state<{ status: string; progress: number; error: string | null } | null>(null);

	async function downloadRoom() {
		try {
			let r = await op<{ id: string; status: string; progress: number; error: string | null; downloadUrl: string }>(
				'export_room_zip',
				{ roomId: room.id },
			);
			roomZip = r;
			while (r.status === 'pending' || r.status === 'running') {
				await new Promise((res) => setTimeout(res, 1500));
				r = await op('get_export', { exportId: r.id });
				roomZip = r;
			}
			if (r.status === 'ready') location.href = r.downloadUrl;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'The zip could not be built.');
			roomZip = null;
		}
	}

	async function remove(node: TreeNode) {
		deleting = node;
		await tick();
		await deleter?.start();
	}

	async function openVersions(node: TreeNode) {
		versions = [];
		versionsOf = node;
		try {
			versions = (await op<{ versions: typeof versions }>('list_file_versions', { fileId: node.id })).versions;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not load the versions.');
			versionsOf = null;
		}
	}

	async function makeCurrent(version: number) {
		if (!versionsOf) return;
		if (await act('set_current_version', { fileId: versionsOf.id, version }, `Version ${version} is now current`))
			await openVersions(versionsOf);
	}
</script>

<svelte:head><title>{room.name} · Files · OpenRoom</title></svelte:head>

{#snippet documentLabel(node: TreeNode)}
	<span class="block max-w-full truncate font-medium">{node.name}</span>
	<span class="mt-1 block text-[11px] text-muted-foreground sm:text-[10px]"><span class="mr-2 tabular-nums">{node.number}</span><span class="sm:hidden">{node.type === 'folder' ? 'Folder' : `${kindLabel[node.kind ?? 'download']} · ${formatBytes(node.size)}`}</span>{#if search && node.parentId}<span>{room.tree.find((n) => n.id === node.parentId)?.name}</span>{/if}</span>
{/snippet}

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<div class="relative w-full min-w-0 flex-none sm:flex-1 sm:max-w-xs"><Search class="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input type="search" aria-label="Search documents" placeholder="Search documents…" class="pl-9" bind:value={search} /></div>
	<div class="flex shrink-0 items-center gap-2">
		{#if canEdit}
			<Button variant="outline" size="sm" class="min-h-11 sm:min-h-8" onclick={() => { folderParent = uploadInto; folderDialog = true; }}><FolderPlus data-icon="inline-start" /><span class="hidden sm:inline">New folder</span><span class="sm:hidden">Folder</span></Button>
			<Button size="sm" class="min-h-11 sm:min-h-8" onclick={() => filesInput?.click()}><Upload data-icon="inline-start" />Upload files</Button>
		{/if}
		<DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="outline" size="icon-sm" aria-label="Document options"><MoreHorizontal /></Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end"><DropdownMenu.Group>{#if canEdit}<DropdownMenu.Item onSelect={() => folderInput?.click()}><Upload />Upload a folder</DropdownMenu.Item><DropdownMenu.Item onSelect={() => { importError = ''; importOpen = true; }}><Link />Import from a URL</DropdownMenu.Item>{/if}<DropdownMenu.Item disabled={!!roomZip && ['pending', 'running'].includes(roomZip.status)} onSelect={downloadRoom}><ArrowDownToLine />Download whole room</DropdownMenu.Item><DropdownMenu.Item onSelect={() => exportIndex('pdf')}><FileDown />Export index as PDF</DropdownMenu.Item><DropdownMenu.Item onSelect={() => exportIndex('csv')}><FileDown />Export index as CSV</DropdownMenu.Item></DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Root>
	</div>
	{#if canEdit}<input bind:this={filesInput} type="file" multiple class="hidden" onchange={pickFiles} /><input bind:this={folderInput} type="file" webkitdirectory class="hidden" onchange={pickFolder} /><input bind:this={versionInput} type="file" class="hidden" onchange={pickVersion} />{/if}
</div>
<PinnedDocuments {room} {canEdit} />
{#if readingDrop}<p role="status" class="mb-3 text-xs text-muted-foreground">Reading folders and preparing uploads…</p>{/if}
{#if roomZip && ['pending', 'running'].includes(roomZip.status)}<p role="status" class="mb-3 text-xs text-muted-foreground">Preparing your room download… {roomZip.progress}%</p>{/if}
<div class="mb-4 flex min-w-0 items-center justify-between gap-3">
	<nav class="flex min-w-0 flex-wrap items-center gap-2 text-xs" aria-label="Document folders"><button type="button" class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground" onclick={() => { uploadInto = ''; search = ''; }}><Home class="size-3.5" />All documents</button>{#each breadcrumb as folder (folder.id)}<ChevronRight class="size-3 text-muted-foreground/50" /><button type="button" class="max-w-44 truncate font-medium" onclick={() => { uploadInto = folder.id; search = ''; }}>{folder.name}</button>{/each}</nav>
	<span class="shrink-0 text-[11px] text-muted-foreground">{visibleNodes.length} item{visibleNodes.length === 1 ? '' : 's'}</span>
</div>

<section
	aria-label="Files"
	class="overflow-hidden rounded-xl border bg-card {dragging ? 'ring-2 ring-ring' : ''}"
	ondragover={(e) => {
		if (canEdit) {
			e.preventDefault();
			dragging = true;
		}
	}}
	ondragleave={() => (dragging = false)}
	ondrop={drop}
>
	{#if visibleNodes.length === 0}
		<Empty.Root class="py-16"><Empty.Header><Empty.Media variant="icon"><FolderPlus /></Empty.Media><Empty.Title>{search ? 'No matching documents' : uploadInto ? 'This folder is ready for your files' : 'Build your data room'}</Empty.Title><Empty.Description>{search ? 'Try a different title or clear your search.' : 'Upload documents or drop a folder here. Your structure stays organized automatically.'}</Empty.Description></Empty.Header><Empty.Content>{#if search}<Button variant="outline" size="sm" onclick={() => (search = '')}>Clear search</Button>{:else if canEdit}<Button size="sm" onclick={() => filesInput?.click()}><Upload data-icon="inline-start" />Upload your first files</Button>{/if}</Empty.Content></Empty.Root>
	{:else}
		<Table.Root>
			<Table.Header class="sr-only sm:not-sr-only">
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head class="hidden sm:table-cell">Type</Table.Head>
					<Table.Head class="hidden text-right md:table-cell">Version</Table.Head>
					<Table.Head class="hidden text-right sm:table-cell">Size</Table.Head>
					{#if canEdit}<Table.Head class="w-10"><span class="sr-only">Actions</span></Table.Head>{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each visibleNodes as node (node.id)}
					<Table.Row>
						<Table.Cell class="w-full max-w-0 py-3 sm:w-auto sm:max-w-none">
							<div class="flex min-w-0 items-center gap-3"><FileIcon kind={node.kind} folder={node.type === 'folder'} /><div class="min-w-0 flex-1">{#if node.type === 'folder'}<button type="button" class="flex min-h-11 w-full min-w-0 flex-col items-start justify-center text-left hover:text-primary" onclick={() => { uploadInto = node.id; search = ''; }}>{@render documentLabel(node)}</button>{:else}<a class="flex min-h-11 min-w-0 flex-col items-start justify-center hover:text-primary" href="/admin/rooms/{room.id}/files/{node.id}" target="_blank" rel="noreferrer">{@render documentLabel(node)}</a>{/if}</div>{#if node.type === 'folder'}<ChevronRight class="size-4 shrink-0 text-muted-foreground/50" />{/if}</div>
						</Table.Cell>
						<Table.Cell class="hidden text-xs text-muted-foreground sm:table-cell">{node.type === 'folder' ? 'Folder' : kindLabel[node.kind ?? 'download']}</Table.Cell>
						<Table.Cell class="hidden text-right text-xs text-muted-foreground md:table-cell">{node.version ? `v${node.version}` : '—'}</Table.Cell>
						<Table.Cell class="hidden text-right text-xs text-muted-foreground sm:table-cell">{node.type === 'folder' ? '—' : formatBytes(node.size)}</Table.Cell>
						{#if canEdit}
							<Table.Cell class="w-12">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button {...props} variant="ghost" size="icon" class="size-11" aria-label="Actions for {node.name}"><MoreHorizontal /></Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end" class="min-w-56">
										<DropdownMenu.Item onSelect={() => {
		renaming = node;
		newName = node.name;
	}}>Rename</DropdownMenu.Item>
										<DropdownMenu.Item onSelect={() => {
		moving = node;
		moveTo = node.parentId ?? '';
	}}>Move to…</DropdownMenu.Item>
										<DropdownMenu.Item onSelect={() => shift(node, -1)}>Move up</DropdownMenu.Item>
										<DropdownMenu.Item onSelect={() => shift(node, 1)}>Move down</DropdownMenu.Item>
										{#if node.type === 'file'}
											<DropdownMenu.Item onSelect={() => window.open(`/admin/rooms/${room.id}/files/${node.id}`, '_blank', 'noopener')}
												>Open</DropdownMenu.Item
											>
											<DropdownMenu.Item onSelect={() => (location.href = `/admin/rooms/${room.id}/files/${node.id}?download=1`)}
												>Download</DropdownMenu.Item
											>
											<DropdownMenu.Separator />
											<DropdownMenu.Item onSelect={() => {
		versionFor = node.id;
		versionInput?.click();
	}}
												>Replace with a new version</DropdownMenu.Item
											>
											<DropdownMenu.Item onSelect={() => openVersions(node)}>Version history</DropdownMenu.Item>
										{/if}
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive" onSelect={() => remove(node)}>Delete…</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Table.Cell>
						{/if}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</section>

{#if deleting}
	<DangerAction
		bind:this={deleter}
		showButton={false}
		operation={deleting.type === 'folder' ? 'delete_folder' : 'delete_file'}
		input={deleting.type === 'folder' ? { folderId: deleting.id } : { fileId: deleting.id }}
		label="Delete"
		confirmLabel={deleting.type === 'folder' ? 'Delete folder' : 'Delete file'}
		title={deleting.type === 'folder' ? 'Delete this folder?' : 'Delete this file?'}
		success="Deleted"
	/>
{/if}

<Dialog.Root bind:open={folderDialog} onOpenChange={() => (dialogError = '')}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>New folder</Dialog.Title></Dialog.Header>
		<form class="space-y-4" onsubmit={createFolder}>
			<div class="space-y-2">
				<Label for="folder-name">Name</Label>
				<Input id="folder-name" required maxlength={200} bind:value={folderName} />
			</div>
			<div class="space-y-2">
				<Label for="folder-parent">Inside</Label>
				<select id="folder-parent" class={selectClass} bind:value={folderParent}>
					<option value="">The top of the room</option>
					{#each folders as f (f.id)}<option value={f.id}>{f.number} {f.name}</option>{/each}
				</select>
			</div>
			{#if dialogError}<p class="text-sm text-destructive" role="alert">{dialogError}</p>{/if}
			<Dialog.Footer><Button type="submit">Create folder</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={!!renaming} onOpenChange={(o) => {
		if (!o) renaming = null;
		dialogError = '';
	}}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>Rename</Dialog.Title></Dialog.Header>
		<form class="space-y-4" onsubmit={rename}>
			<Input aria-label="New name" required maxlength={200} bind:value={newName} />
			{#if dialogError}<p class="text-sm text-destructive" role="alert">{dialogError}</p>{/if}
			<div class="flex justify-end">
				<Button type="submit">Save</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={!!moving} onOpenChange={(o) => {
		if (!o) moving = null;
		dialogError = '';
	}}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>Move “{moving?.name}”</Dialog.Title></Dialog.Header>
		<form class="space-y-4" onsubmit={move}>
			<select aria-label="Move to" class={selectClass} bind:value={moveTo}>
				<option value="">The top of the room</option>
				{#each moveTargets as f (f.id)}
					<option value={f.id}>{f.number} {f.name}</option>
				{/each}
			</select>
			{#if dialogError}<p class="text-sm text-destructive" role="alert">{dialogError}</p>{/if}
			<Dialog.Footer><Button type="submit">Move</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={!!versionsOf} onOpenChange={(o) => !o && (versionsOf = null)}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Versions of “{versionsOf?.name}”</Dialog.Title>
			<Dialog.Description>Investors see the current version. Make an earlier one current to undo a wrong upload.</Dialog.Description>
		</Dialog.Header>
		<ul class="divide-y">
			{#each versions as v (v.version)}
				<li class="flex items-center justify-between gap-3 py-2 text-sm">
					<div>
						<p>
							Version {v.version}
							{#if v.current}<Badge variant="secondary" class="ml-1">Current</Badge>{/if}
						</p>
						<p class="text-xs text-muted-foreground">
							{v.originalName} · {formatBytes(v.size)} · {formatDate(v.createdAt, data.timeZone)}
						</p>
					</div>
					{#if !v.current}<Button variant="outline" size="sm" onclick={() => makeCurrent(v.version)}>Make current</Button>{/if}
				</li>
			{/each}
		</ul>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={importOpen}>
 <Dialog.Content>
  <Dialog.Header><Dialog.Title>Import a document</Dialog.Title><Dialog.Description>Use a direct public HTTPS link to a file. The document is copied into this folder.</Dialog.Description></Dialog.Header>
  <form class="space-y-4" onsubmit={importDocument}>
   <div class="space-y-2"><Label for="import-url">File URL</Label><Input id="import-url" type="url" required placeholder="https://example.com/document.pdf" bind:value={importUrl} disabled={importing} /></div>
   <div class="space-y-2"><Label for="import-name">File name</Label><Input id="import-name" required maxlength={255} placeholder="Company overview.pdf" bind:value={importName} disabled={importing} /></div>
   <details class="text-xs"><summary class="cursor-pointer text-muted-foreground">The source has no file size</summary><div class="mt-3 space-y-2"><Label for="import-size">Exact size in bytes</Label><Input id="import-size" type="number" min={1} step={1} bind:value={importSize} disabled={importing} /><p class="text-muted-foreground">Usually detected automatically. Supply it only if the source omits its size.</p></div></details>
   {#if importError}<p role="alert" class="text-sm text-destructive">{importError}</p>{/if}
   <Dialog.Footer><Button type="submit" disabled={importing}>{importing ? 'Importing…' : 'Import document'}</Button></Dialog.Footer>
  </form>
 </Dialog.Content>
</Dialog.Root>
