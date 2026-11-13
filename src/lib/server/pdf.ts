import { database } from './db/index.ts';
import { objectBytes, objectSize } from './storage.ts';

const maxBytes = 100 * 1024 ** 2;

export async function countPdfPages(objectKey: string) {
	if ((await objectSize(objectKey)) > maxBytes) return null;
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = pdfjs.getDocument({
		data: await objectBytes(objectKey),
		disableFontFace: true,
		verbosity: 0,
	});
	try {
		return (await task.promise).numPages;
	} catch {
		return null;
	} finally {
		await task.destroy();
	}
}

export async function runPageCount(payload: unknown) {
	const { versionId } = payload as { versionId: string };
	const sqlite = database().sqlite;
	const v = sqlite.prepare('SELECT object_key FROM file_versions WHERE id = ?').get(versionId) as
		| { object_key: string }
		| undefined;
	if (!v) return;
	const pages = await countPdfPages(v.object_key);
	sqlite.prepare('UPDATE file_versions SET pages = ? WHERE id = ?').run(pages, versionId);
}
