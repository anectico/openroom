import { invalidateAll } from '$app/navigation';
import { op } from './op.ts';

export type UploadTarget =
	| { kind: 'file'; roomId: string; folderId: string | null }
	| { kind: 'version'; fileId: string };

export type QueueItem = {
	id: number;
	file: File;
	target: UploadTarget;
	progress: number;
	status: 'waiting' | 'sending' | 'done' | 'failed';
	error: string;
};

function put(url: string, file: File, onProgress: (share: number) => void) {
	return new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', url);
		xhr.setRequestHeader('content-type', 'application/octet-stream');
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
		xhr.onload = () => {
			if (xhr.status === 200) resolve();
			else {
				let message = `Upload failed (${xhr.status}).`;
				try {
					message = JSON.parse(xhr.responseText).error.message;
				} catch {}
				reject(new Error(message));
			}
		};
		xhr.onerror = () => reject(new Error('The connection broke. Retry to send the file again.'));
		xhr.send(file);
	});
}

class UploadQueue {
	items = $state<QueueItem[]>([]);
	#next = 1;
	#running = false;

	add(files: File[], target: UploadTarget) {
		for (const file of files)
			this.items.push({ id: this.#next++, file, target, progress: 0, status: 'waiting', error: '' });
		void this.#run();
	}

	retry(id: number) {
		const item = this.items.find((i) => i.id === id);
		if (!item) return;
		item.status = 'waiting';
		item.error = '';
		item.progress = 0;
		void this.#run();
	}

	clearDone() {
		this.items = this.items.filter((i) => i.status !== 'done');
	}

	async #send(item: QueueItem) {
		item.status = 'sending';
		try {
			const created = await op<{ uploadId: string; url: string }>('create_upload', {
				target: item.target,
				name: item.file.name,
				size: item.file.size,
			});
			await put(created.url, item.file, (share) => (item.progress = share));
			await op('finish_upload', { uploadId: created.uploadId });
			item.status = 'done';
			item.progress = 1;
		} catch (e) {
			item.status = 'failed';
			item.error =
				e instanceof TypeError
					? 'The connection was lost. Reconnect and retry.'
					: e instanceof Error
						? e.message
						: 'Upload failed.';
		}
	}

	async #run() {
		if (this.#running) return;
		this.#running = true;
		try {
			for (let item = this.#waiting(); item; item = this.#waiting()) {
				await this.#send(item);
				if (item.status === 'done' && navigator.onLine) await invalidateAll().catch(() => {});
			}
		} finally {
			this.#running = false;
		}
	}

	#waiting() {
		return this.items.find((i) => i.status === 'waiting');
	}
}

export const uploads = new UploadQueue();

type UploadEntry = { path: string; file?: File };

async function addTree(entries: UploadEntry[], roomId: string, parentId: string | null) {
	const folders = new Map<string, string | null>([['', parentId]]);
	const ensure = async (path: string): Promise<string | null> => {
		if (folders.has(path)) return folders.get(path) ?? null;
		const cut = path.lastIndexOf('/');
		const parent = await ensure(cut < 0 ? '' : path.slice(0, cut));
		const created = await op<{ id: string }>('create_folder', {
			roomId,
			parentId: parent,
			name: path.slice(cut + 1),
		});
		folders.set(path, created.id);
		return created.id;
	};
	for (const { path, file } of entries
		.filter((entry) => !entry.path.split('/').some((part) => part.startsWith('.')))
		.sort((a, b) => a.path.localeCompare(b.path))) {
		if (!file) {
			await ensure(path);
			continue;
		}
		const folderId = await ensure(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
		uploads.add([file], { kind: 'file', roomId, folderId });
	}
	await invalidateAll();
}

export function addFolderUpload(files: File[], roomId: string, parentId: string | null) {
	return addTree(
		files.map((file) => ({ path: file.webkitRelativePath || file.name, file })),
		roomId,
		parentId,
	);
}

export async function addDroppedUpload(data: DataTransfer, roomId: string, parentId: string | null) {
	const items = [...data.items]
		.filter((item) => item.kind === 'file')
		.map((item) => ({ entry: item.webkitGetAsEntry?.(), file: item.getAsFile() }));
	const files = [...data.files];
	const entries: UploadEntry[] = [];
	async function visit(entry: FileSystemEntry, parent: string) {
		if (entry.name.startsWith('.')) return;
		const path = parent ? `${parent}/${entry.name}` : entry.name;
		if (entry.isDirectory) {
			entries.push({ path });
			const reader = (entry as FileSystemDirectoryEntry).createReader();
			for (;;) {
				const children = await new Promise<FileSystemEntry[]>((resolve, reject) =>
					reader.readEntries(resolve, reject),
				);
				if (!children.length) break;
				for (const child of children) await visit(child, path);
			}
		} else if (entry.isFile) {
			const file = await new Promise<File>((resolve, reject) =>
				(entry as FileSystemFileEntry).file(resolve, reject),
			);
			entries.push({ path, file });
		}
	}
	if (!items.length) return addFolderUpload(files, roomId, parentId);
	for (const item of items) {
		if (item.entry) await visit(item.entry, '');
		else if (item.file)
			entries.push({ path: item.file.webkitRelativePath || item.file.name, file: item.file });
	}
	await addTree(entries, roomId, parentId);
}
