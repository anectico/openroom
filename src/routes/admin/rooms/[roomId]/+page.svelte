<script lang="ts">
	import { ArrowDown, ArrowDownToLine, ArrowUp, Check, ChevronRight, ExternalLink, FileDown, FileUp, FolderInput, FolderPlus, History, Home, Link, MoreHorizontal, Pencil, Search, Trash2, Upload, X } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import ChoiceSelect from '#lib/admin/ChoiceSelect.svelte';
	import DangerAction from '#lib/admin/DangerAction.svelte';
	import FileIcon from '#lib/admin/FileIcon.svelte';
	import { act, attempt, formatBytes, formatDate, op } from '#lib/admin/op.ts';
	import PinnedDocuments from '#lib/admin/PinnedDocuments.svelte';
	import SectionHeading from '#lib/admin/SectionHeading.svelte';
	import type { TreeNode } from '#lib/admin/types.ts';
	import { addDroppedUpload, addFolderUpload, uploads } from '#lib/admin/uploads.svelte.ts';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	const room = $derived(data.room);
	const canEdit = $derived(data.member?.role !== 'observer' && !room.frozenAt);
	const folders = $derived(room.tree.filter((n) => n.type === 'folder'));
	let pinsOpen = $state(false);
	const hasFiles = $derived(room.fileCount > 0);
	const hasPins = $derived(room.pinnedFileIds.length > 0);
	const hasLink = $derived(room.activeLinkCount > 0);
	let uploadInto = $state<string>('');
	let search = $state('');
	const visibleNodes = $derived(search.trim() ? room.tree.filter((node) => node.name.toLowerCase().includes(search.trim().toLowerCase())) : room.tree.filter((node) => node.parentId === (uploadInto || null)));
	let setupDismissed = $state(false);
	const setupKey = $derived(`openroom:setup-dismissed:${room.id}`);
	onMount(() => {
		try { setupDismissed = localStorage.getItem(setupKey) === '1'; } catch {}
	});
	function dismissSetup() {
		setupDismissed = true;
		try { localStorage.setItem(setupKey, '1'); } catch {}
	}
	const showSetup = $derived(canEdit && !setupDismissed && !(hasFiles && hasLink));
	const childCount = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const node of room.tree) if (node.parentId) counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
		return counts;
	});
	const dateOnly = (ms: number) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: data.timeZone }).format(ms);
	const selected = new SvelteSet<string>();
	const selectedNodes = $derived(room.tree.filter((node) => selected.has(node.id)));
	$effect(() => {
		for (const id of selected) if (!room.tree.some((node) => node.id === id)) selected.delete(id);
	});
	const allVisibleSelected = $derived(visibleNodes.length > 0 && visibleNodes.every((node) => selected.has(node.id)));
	function toggleAll(value: boolean) {
		for (const node of visibleNodes) {
			if (value) selected.add(node.id);
			else selected.delete(node.id);
		}
	}
	function toggle(node: TreeNode, value: boolean) {
		if (value) selected.add(node.id);
		else selected.delete(node.id);
	}

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
		if (importing) return;
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
	let dialogBusy = $state(false);

	let deleting = $state<TreeNode | null>(null);
	let deleter = $state<ReturnType<typeof DangerAction>>();
	let renaming = $state<TreeNode | null>(null);
	let newName = $state('');
	let moving = $state<TreeNode | null>(null);
	let moveTo = $state('');
	let movePosition = $state('end');
	let bulkMoving = $state(false);
	let bulkMoveTo = $state('');
	let bulkDeleting = $state(false);
	let bulkBusy = $state(false);
	let bulkError = $state('');
	const bulkMoveTargets = $derived.by(() => {
		const blocked = new Set<string>();
		for (const node of selectedNodes) if (node.type === 'folder') for (const id of descendants(node.id)) blocked.add(id);
		return folders.filter((f) => !blocked.has(f.id));
	});
	const positionChoices = $derived.by(() => {
		const node = moving;
		if (!node) return [];
		const others = room.tree.filter((n) => n.parentId === (moveTo || null) && n.id !== node.id);
		return [{ value: 'end', label: 'At the end' }, ...others.map((n, i) => ({ value: String(i), label: `${i + 1}. Before “${n.name}”` }))];
	});

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
		if (dialogBusy) return;
		dialogBusy = true;
		const r = await attempt('create_folder', { roomId: room.id, name: folderName, parentId: folderParent || null }, 'Folder created');
		dialogBusy = false;
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
		if (!renaming || dialogBusy) return;
		dialogBusy = true;
		const r =
			renaming.type === 'folder'
				? await attempt('update_folder', { folderId: renaming.id, name: newName }, 'Renamed')
				: await attempt('update_file', { fileId: renaming.id, title: newName }, 'Renamed');
		dialogBusy = false;
		if (!r.ok) {
			dialogError = r.error;
			return;
		}
		renaming = null;
		dialogError = '';
	}

	async function move(event: SubmitEvent) {
		event.preventDefault();
		if (!moving || dialogBusy) return;
		dialogBusy = true;
		const position = movePosition === 'end' ? {} : { position: Number(movePosition) };
		const r =
			moving.type === 'folder'
				? await attempt('update_folder', { folderId: moving.id, parentId: moveTo || null, ...position }, 'Moved')
				: await attempt('update_file', { fileId: moving.id, folderId: moveTo || null, ...position }, 'Moved');
		dialogBusy = false;
		if (!r.ok) {
			dialogError = r.error;
			return;
		}
		moving = null;
		dialogError = '';
	}

	async function runEach(nodes: TreeNode[], call: (node: TreeNode) => Promise<unknown>) {
		const failed: string[] = [];
		for (const node of nodes) {
			try {
				await call(node);
			} catch (e) {
				failed.push(`${node.name}: ${e instanceof Error ? e.message : 'failed'}`);
			}
		}
		await invalidateAll();
		return failed;
	}

	async function bulkMove(event: SubmitEvent) {
		event.preventDefault();
		if (bulkBusy) return;
		bulkBusy = true;
		bulkError = '';
		const target = bulkMoveTo || null;
		const nodes = selectedNodes.filter((node) => !selectedNodes.some((other) => other.type === 'folder' && other.id !== node.id && descendants(other.id).has(node.id)));
		const failed = await runEach(nodes, (node) =>
			node.type === 'folder' ? op('update_folder', { folderId: node.id, parentId: target }) : op('update_file', { fileId: node.id, folderId: target }),
		);
		bulkBusy = false;
		if (failed.length) {
			bulkError = failed.join(' ');
			return;
		}
		toast.success(`Moved ${nodes.length} item${nodes.length === 1 ? '' : 's'}`);
		bulkMoving = false;
		selected.clear();
	}

	async function bulkDelete() {
		if (bulkBusy) return;
		bulkBusy = true;
		bulkError = '';
		const nodes = selectedNodes.filter((node) => !selectedNodes.some((other) => other.type === 'folder' && other.id !== node.id && descendants(other.id).has(node.id)));
		const failed = await runEach(nodes, (node) =>
			node.type === 'folder' ? op('delete_folder', { folderId: node.id, confirm: true }) : op('delete_file', { fileId: node.id, confirm: true }),
		);
		bulkBusy = false;
		if (failed.length) {
			bulkError = failed.join(' ');
			return;
		}
		toast.success(`Deleted ${nodes.length} item${nodes.length === 1 ? '' : 's'}`);
		bulkDeleting = false;
		selected.clear();
	}

	const selectedFiles = $derived.by(() => {
		const ids = new Set<string>();
		for (const node of selectedNodes) {
			if (node.type === 'file') ids.add(node.id);
			else for (const f of room.tree) if (f.type === 'file' && f.parentId && descendants(node.id).has(f.parentId)) ids.add(f.id);
		}
		return ids.size;
	});

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
		if (roomZip && ['pending', 'running'].includes(roomZip.status)) return;
		roomZip = { status: 'pending', progress: 0, error: null };
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
			toast.error(e instanceof Error ? e.message : 'The ZIP could not be built.');
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

<svelte:head><title>{room.name} · Documents · OpenRoom</title></svelte:head>

{#snippet documentLabel(node: TreeNode)}
	{@const items = childCount.get(node.id) ?? 0}
	<span class="block max-w-full truncate font-medium">{node.name}</span>
	<span class="mt-0.5 block text-xs text-muted-foreground">{#if node.type === 'folder'}{items} item{items === 1 ? '' : 's'}{:else}<span class="@min-[36rem]/library:hidden">{kindLabel[node.kind ?? 'download']} · {formatBytes(node.size)}</span><span class="hidden @min-[36rem]/library:inline">{kindLabel[node.kind ?? 'download']}</span>{/if}{#if search && node.parentId}<span> · in {room.tree.find((n) => n.id === node.parentId)?.name}</span>{/if}</span>
{/snippet}

{#snippet stepNumber(number: number, done: boolean, current: boolean)}
	<span class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold {done || current ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">
		{#if done}<Check class="size-4" aria-hidden="true" /><span class="sr-only">Completed</span>{:else}{number}{/if}
	</span>
{/snippet}

{#if canEdit}<input bind:this={filesInput} type="file" multiple class="hidden" onchange={pickFiles} /><input bind:this={folderInput} type="file" webkitdirectory class="hidden" onchange={pickFolder} /><input bind:this={versionInput} type="file" class="hidden" onchange={pickVersion} />{/if}

<SectionHeading title="Documents" description="Upload, order and update what investors read. Each sharing link shows only the documents its group allows." />

<PinnedDocuments {room} {canEdit} bind:open={pinsOpen} />
{#if readingDrop}<p role="status" class="mb-3 text-xs text-muted-foreground">Reading folders and preparing uploads…</p>{/if}
{#if roomZip && ['pending', 'running'].includes(roomZip.status)}<p role="status" class="mb-3 text-xs text-muted-foreground">Preparing your room download… {roomZip.progress}%</p>{/if}
<div class="@container">
	<div class="grid gap-4 {showSetup ? '@min-[54rem]:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]' : ''}">

		<section
			aria-label="Documents"
			class="@container/library min-w-0 rounded-xl border bg-card p-4 sm:p-5 {dragging ? 'ring-2 ring-ring' : ''}"
			ondragover={(e) => {
				if (canEdit) {
					e.preventDefault();
					dragging = true;
				}
			}}
			ondragleave={() => (dragging = false)}
			ondrop={drop}
		>
			<header class="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
				<h2 class="flex items-baseline gap-2 font-semibold">All documents <span class="text-sm font-normal text-muted-foreground">{room.fileCount}</span></h2>
				<div class="flex flex-wrap items-center gap-1">
					{#if canEdit}
						<Button variant="outline" size="sm" class="min-h-9" onclick={() => { folderParent = uploadInto; folderDialog = true; }}><FolderPlus />New folder</Button>
						{#if room.tree.length}<Button size="sm" class="min-h-9" onclick={() => filesInput?.click()}><Upload />Upload documents</Button>{/if}
					{/if}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="icon-sm" aria-label="Document options"><MoreHorizontal /></Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Group>
								{#if canEdit}
									<DropdownMenu.Item onSelect={() => folderInput?.click()}><Upload />Upload a folder</DropdownMenu.Item>
									<DropdownMenu.Item onSelect={() => { importError = ''; importOpen = true; }}><Link />Import from a URL</DropdownMenu.Item>
									<DropdownMenu.Separator />
								{/if}
								<DropdownMenu.Item disabled={!!roomZip && ['pending', 'running'].includes(roomZip.status)} onSelect={downloadRoom}><ArrowDownToLine />Download whole room as ZIP</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={() => exportIndex('pdf')}><FileDown />Export index as PDF</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={() => exportIndex('csv')}><FileDown />Export index as CSV</DropdownMenu.Item>
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</header>
			{#if room.tree.length || search}
				<div class="relative mt-4 mb-3 max-w-sm"><Search class="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input type="search" aria-label="Search documents" placeholder="Search documents…" class="pl-9" bind:value={search} /></div>
			{/if}
			{#if canEdit && selected.size}
				<section class="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm" aria-label="Selected documents">
					<span class="mr-auto text-sm font-medium" role="status">{selected.size} selected</span>
					<Button variant="outline" size="sm" onclick={() => { bulkMoveTo = uploadInto; bulkError = ''; bulkMoving = true; }}><FolderInput aria-hidden="true" />Move…</Button>
					<Button variant="destructive" size="sm" onclick={() => { bulkError = ''; bulkDeleting = true; }}><Trash2 aria-hidden="true" />Delete…</Button>
					<Button variant="ghost" size="icon-sm" aria-label="Clear selection" onclick={() => selected.clear()}><X /></Button>
				</section>
			{/if}
			{#if uploadInto}
				<div class="mb-3"><nav class="flex min-w-0 flex-wrap items-center gap-2 text-xs" aria-label="Document folders"><button type="button" class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground" onclick={() => { uploadInto = ''; search = ''; }}><Home class="size-3.5" />All documents</button>{#each breadcrumb as folder (folder.id)}<ChevronRight class="size-3 text-muted-foreground/50" /><button type="button" class="max-w-44 truncate font-medium" onclick={() => { uploadInto = folder.id; search = ''; }}>{folder.name}</button>{/each}</nav></div>
			{/if}
			{#if visibleNodes.length === 0}
				<div class="flex min-h-48 flex-col items-center justify-center gap-4 px-2 py-8 text-center">
					{#if search}
						<p>No matching documents</p>
						<Button variant="outline" size="sm" onclick={() => (search = '')}>Clear search</Button>
					{:else if canEdit}
						<Upload class="size-8 text-muted-foreground" strokeWidth={1.5} />
						<p class="text-sm font-medium">Drop files or a folder here.</p>
						{#if !room.tree.length}<Button onclick={() => filesInput?.click()}>Upload documents</Button>{/if}
					{:else}
						<p class="text-sm text-muted-foreground">No documents here yet.</p>
					{/if}
				</div>
			{:else}
				<Table.Root>
					<Table.Header class="sr-only @min-[28rem]/library:not-sr-only">
						<Table.Row>
							{#if canEdit}<Table.Head class="w-10 pr-0"><Checkbox class="hidden @min-[28rem]/library:flex" aria-label="Select all shown documents" checked={allVisibleSelected} indeterminate={!allVisibleSelected && visibleNodes.some((node) => selected.has(node.id))} onCheckedChange={(value) => toggleAll(value === true)} /></Table.Head>{/if}
							<Table.Head>Name</Table.Head>
							<Table.Head class="hidden text-right @min-[28rem]/library:table-cell">Investors</Table.Head>
							<Table.Head class="hidden @min-[36rem]/library:table-cell">Updated</Table.Head>
							<Table.Head class="hidden text-right @min-[36rem]/library:table-cell">Size</Table.Head>
							{#if canEdit}<Table.Head class="w-10"><span class="sr-only">Actions</span></Table.Head>{/if}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each visibleNodes as node (node.id)}
							<Table.Row data-state={selected.has(node.id) ? 'selected' : undefined}>
								{#if canEdit}<Table.Cell class="w-10 pr-0"><span class="flex size-11 items-center justify-center sm:size-8"><Checkbox aria-label="Select {node.name}" checked={selected.has(node.id)} onCheckedChange={(value) => toggle(node, value === true)} /></span></Table.Cell>{/if}
								<Table.Cell class="w-full max-w-0 py-3 @min-[28rem]/library:w-auto @min-[28rem]/library:max-w-none">
									<div class="flex min-w-0 items-center gap-3"><FileIcon kind={node.kind} folder={node.type === 'folder'} /><div class="min-w-0 flex-1">{#if node.type === 'folder'}<button type="button" class="flex min-h-11 w-full min-w-0 flex-col items-start justify-center text-left hover:text-primary" onclick={() => { uploadInto = node.id; search = ''; }}>{@render documentLabel(node)}</button>{:else}<a class="flex min-h-11 min-w-0 flex-col items-start justify-center hover:text-primary" href="/admin/rooms/{room.id}/files/{node.id}" target="_blank" rel="noreferrer">{@render documentLabel(node)}</a>{/if}</div>{#if node.type === 'folder'}<ChevronRight class="size-4 shrink-0 text-muted-foreground/50" />{/if}</div>
								</Table.Cell>
								<Table.Cell class="hidden text-right text-xs tabular-nums @min-[28rem]/library:table-cell">{#if node.type === 'file' && node.viewerCount}<a class="inline-flex min-h-9 items-center font-medium hover:text-primary hover:underline" href="/admin/rooms/{room.id}/activity?view=files&file={node.id}" aria-label="{node.viewerCount} investor{node.viewerCount === 1 ? '' : 's'} opened {node.name}; see analytics">{node.viewerCount}</a>{:else}<span class="text-muted-foreground">{node.viewerCount ?? 0}</span>{/if}</Table.Cell>
								<Table.Cell class="hidden text-xs text-muted-foreground @min-[36rem]/library:table-cell">{node.updatedAt ? dateOnly(node.updatedAt) : '—'}</Table.Cell>
								<Table.Cell class="hidden text-right text-xs text-muted-foreground @min-[36rem]/library:table-cell">{node.type === 'folder' ? '—' : formatBytes(node.size)}</Table.Cell>
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
			}}><Pencil aria-hidden="true" />Rename</DropdownMenu.Item>
												<DropdownMenu.Item onSelect={() => {
				moving = node;
				moveTo = node.parentId ?? '';
				movePosition = String(siblings(node).findIndex((n) => n.id === node.id));
			}}><FolderInput aria-hidden="true" />Move or reorder…</DropdownMenu.Item>
												<DropdownMenu.Item onSelect={() => shift(node, -1)}><ArrowUp aria-hidden="true" />Move up</DropdownMenu.Item>
												<DropdownMenu.Item onSelect={() => shift(node, 1)}><ArrowDown aria-hidden="true" />Move down</DropdownMenu.Item>
												{#if node.type === 'file'}
													<DropdownMenu.Separator />
													<DropdownMenu.Item onSelect={() => window.open(`/admin/rooms/${room.id}/files/${node.id}`, '_blank', 'noopener')}
														><ExternalLink aria-hidden="true" />Open</DropdownMenu.Item
													>
													<DropdownMenu.Item onSelect={() => (location.href = `/admin/rooms/${room.id}/files/${node.id}?download=1`)}
														><ArrowDownToLine aria-hidden="true" />Download</DropdownMenu.Item
													>
													<DropdownMenu.Separator />
													<DropdownMenu.Item onSelect={() => {
				versionFor = node.id;
				versionInput?.click();
			}}
														><FileUp aria-hidden="true" />Replace with a new version</DropdownMenu.Item
													>
													<DropdownMenu.Item onSelect={() => openVersions(node)}><History aria-hidden="true" />Version history{#if node.version && node.version > 1}<span class="ml-auto text-xs text-muted-foreground">v{node.version}</span>{/if}</DropdownMenu.Item>
												{/if}
												<DropdownMenu.Separator />
												<DropdownMenu.Item variant="destructive" onSelect={() => remove(node)}><Trash2 aria-hidden="true" />Delete…</DropdownMenu.Item>
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
		{#if showSetup}
			<aside aria-labelledby="room-setup-heading" class="rounded-xl border bg-card p-4 sm:p-5">
				<div class="flex items-center justify-between gap-2 border-b pb-3"><h2 id="room-setup-heading" class="flex min-h-9 items-center font-semibold">Room setup</h2><Button variant="ghost" size="sm" onclick={dismissSetup}>Dismiss</Button></div>
				<ol class="mt-2 space-y-1 text-sm">
					<li><button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-md text-left hover:bg-muted/50" onclick={() => filesInput?.click()}>
						{@render stepNumber(1, hasFiles, !hasFiles)} Upload documents
					</button></li>
					<li><a href="/admin/rooms/{room.id}/links{hasLink ? '' : '?new=1'}" class="flex min-h-11 items-center gap-3 rounded-md hover:bg-muted/50">
						{@render stepNumber(2, hasLink, hasFiles && !hasLink)} {hasLink ? 'Sharing link created' : 'Create a sharing link'}
					</a></li>
					<li><button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-md text-left hover:enabled:bg-muted/50 disabled:text-muted-foreground" disabled={!hasFiles} onclick={() => (pinsOpen = true)}>
						{@render stepNumber(3, hasPins, false)} <span>Pin a starting document <span class="block text-xs text-muted-foreground">Optional</span></span>
					</button></li>
				</ol>
			</aside>
		{/if}
	</div>
</div>

{#if deleting}
	<DangerAction
		bind:this={deleter}
		showButton={false}
		operation={deleting.type === 'folder' ? 'delete_folder' : 'delete_file'}
		input={deleting.type === 'folder' ? { folderId: deleting.id } : { fileId: deleting.id }}
		label="Delete"
		confirmLabel={deleting.type === 'folder' ? 'Delete folder' : 'Delete document'}
		title={deleting.type === 'folder' ? `Delete the folder “${deleting.name}”?` : `Delete “${deleting.name}”?`}
		success="Deleted"
	/>
{/if}

<Dialog.Root bind:open={folderDialog} onOpenChange={() => (dialogError = '')}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>New folder</Dialog.Title><Dialog.Description>Folders are numbered in the room index. Investors see a folder only when their group allows it.</Dialog.Description></Dialog.Header>
		<form class="space-y-4" onsubmit={createFolder}>
			<div class="space-y-2">
				<Label for="folder-name">Name</Label>
				<Input id="folder-name" required maxlength={200} bind:value={folderName} />
			</div>
			<div class="space-y-2">
				<Label for="folder-parent">Inside</Label>
				<ChoiceSelect id="folder-parent" class="w-full" bind:value={folderParent}
					options={[{ value: '', label: 'The top of the room' }, ...folders.map((f) => ({ value: f.id, label: `${f.number} ${f.name}` }))]}
				/>
			</div>
			{#if dialogError}<p class="text-sm text-destructive" role="alert">{dialogError}</p>{/if}
			<Dialog.Footer><Button type="button" variant="outline" onclick={() => (folderDialog = false)}>Cancel</Button><Button type="submit" disabled={dialogBusy}>{dialogBusy ? 'Creating…' : 'Create folder'}</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={!!renaming} onOpenChange={(o) => {
		if (!o) renaming = null;
		dialogError = '';
	}}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>Rename “{renaming?.name}”</Dialog.Title><Dialog.Description>{renaming?.type === 'folder' ? 'Investors see the new folder name at once.' : 'Investors see the new title at once. The file itself and its versions stay the same.'}</Dialog.Description></Dialog.Header>
		<form class="space-y-4" onsubmit={rename}>
			<div class="space-y-2">
				<Label for="rename-input">{renaming?.type === 'folder' ? 'Folder name' : 'Document title'}</Label>
				<Input id="rename-input" required maxlength={200} bind:value={newName} />
			</div>
			{#if dialogError}<p class="text-sm text-destructive" role="alert">{dialogError}</p>{/if}
			<Dialog.Footer><Button type="button" variant="outline" onclick={() => (renaming = null)}>Cancel</Button><Button type="submit" disabled={dialogBusy || !newName.trim() || newName === renaming?.name}>{dialogBusy ? 'Saving…' : 'Rename'}</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={!!moving} onOpenChange={(o) => {
		if (!o) moving = null;
		dialogError = '';
	}}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>Move “{moving?.name}”</Dialog.Title><Dialog.Description>Choose a folder and a place in it. The room index numbers update for everyone.</Dialog.Description></Dialog.Header>
		<form class="space-y-4" onsubmit={move}>
			<div class="space-y-2">
				<Label for="move-folder">Folder</Label>
				<ChoiceSelect id="move-folder" class="w-full" bind:value={() => moveTo, (value) => { moveTo = value; movePosition = 'end'; }}
					options={[{ value: '', label: 'The top of the room' }, ...moveTargets.map((f) => ({ value: f.id, label: `${f.number} ${f.name}` }))]}
				/>
			</div>
			<div class="space-y-2">
				<Label for="move-position">Position</Label>
				<ChoiceSelect id="move-position" class="w-full" bind:value={movePosition} options={positionChoices} />
			</div>
			{#if dialogError}<p class="text-sm text-destructive" role="alert">{dialogError}</p>{/if}
			<Dialog.Footer><Button type="button" variant="outline" onclick={() => (moving = null)}>Cancel</Button><Button type="submit" disabled={dialogBusy}>{dialogBusy ? 'Moving…' : 'Move'}</Button></Dialog.Footer>
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

<Dialog.Root bind:open={() => bulkMoving, (value) => { if (!bulkBusy) bulkMoving = value; }}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>Move {selected.size} item{selected.size === 1 ? '' : 's'}</Dialog.Title><Dialog.Description>They go to the end of the folder you choose, in their current order.</Dialog.Description></Dialog.Header>
		<form class="space-y-4" onsubmit={bulkMove}>
			<div class="space-y-2">
				<Label for="bulk-move-folder">Folder</Label>
				<ChoiceSelect id="bulk-move-folder" class="w-full" bind:value={bulkMoveTo}
					options={[{ value: '', label: 'The top of the room' }, ...bulkMoveTargets.map((f) => ({ value: f.id, label: `${f.number} ${f.name}` }))]}
				/>
			</div>
			{#if bulkError}<p class="text-sm text-destructive" role="alert">{bulkError}</p>{/if}
			<Dialog.Footer><Button type="button" variant="outline" disabled={bulkBusy} onclick={() => (bulkMoving = false)}>Cancel</Button><Button type="submit" disabled={bulkBusy}>{bulkBusy ? 'Moving…' : 'Move'}</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={() => bulkDeleting, (value) => { if (!bulkBusy) bulkDeleting = value; }}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {selected.size} item{selected.size === 1 ? '' : 's'}?</AlertDialog.Title>
			<AlertDialog.Description>This deletes {selectedFiles} document{selectedFiles === 1 ? '' : 's'} with all their versions{selectedNodes.some((node) => node.type === 'folder') ? ', and the selected folders with everything inside them' : ''}. Investors lose access at once. This cannot be undone.</AlertDialog.Description>
		</AlertDialog.Header>
		{#if bulkError}<p class="text-sm text-destructive" role="alert">{bulkError}</p>{/if}
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={bulkBusy}>Cancel</AlertDialog.Cancel>
			<Button variant="destructive" disabled={bulkBusy} onclick={bulkDelete}>{bulkBusy ? 'Deleting…' : 'Delete'}</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
