import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ZipArchive, type ZipOptions } from 'archiver';

type Entry = { name: string; source: Readable | Buffer | string; store?: boolean };

export async function writeZip(
	path: string,
	entries: Entry[],
	options: ZipOptions = {},
	onEntry?: () => void,
) {
	const out = createWriteStream(path);
	const zip = new ZipArchive(options);
	try {
		await new Promise<void>((resolve, reject) => {
			let failed = false;
			const fail = (error: unknown) => {
				if (failed) return;
				failed = true;
				zip.abort();
				zip.destroy();
				out.destroy();
				for (const entry of entries) if (entry.source instanceof Readable) entry.source.destroy();
				reject(error);
			};
			out.on('error', fail);
			out.on('close', () => {
				if (out.writableFinished) resolve();
				else fail(new Error('The zip output closed before it finished.'));
			});
			zip.on('error', fail);
			zip.on('warning', fail);
			if (onEntry)
				zip.on('entry', () => {
					try {
						onEntry();
					} catch (error) {
						fail(error);
					}
				});
			try {
				zip.pipe(out);
				for (const entry of entries) {
					if (entry.source instanceof Readable) entry.source.on('error', fail);
					zip.append(entry.source, { name: entry.name, store: entry.store });
				}
				void zip.finalize().catch(fail);
			} catch (error) {
				fail(error);
			}
		});
	} finally {
		await finished(out).catch(() => {});
	}
}
