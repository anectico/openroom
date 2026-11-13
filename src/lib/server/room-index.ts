import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import { database } from './db/index.ts';
import { exportTtlMs } from './exports.ts';
import { newId } from './ids.ts';
import { roomTree } from './rooms.ts';
import { localPath, requireDiskSpace } from './storage.ts';

const kindLabel: Record<string, string> = {
	pdf: 'PDF',
	image: 'Image',
	video: 'Video',
	download: 'Download only',
};

function rows(roomId: string) {
	const tree = roomTree(roomId);
	const byId = new Map(tree.map((n) => [n.id, n]));
	return tree.map((n) => {
		const path: string[] = [];
		for (
			let p = n.parentId ? byId.get(n.parentId) : undefined;
			p;
			p = p.parentId ? byId.get(p.parentId) : undefined
		)
			path.unshift(p.name);
		return {
			number: n.number,
			depth: n.depth,
			type: n.type === 'folder' ? 'Folder' : kindLabel[n.kind ?? 'download'],
			title: n.name,
			folder: path.join(' / '),
			version: n.version,
			size: n.size,
		};
	});
}

const cell = (value: unknown) => {
	let text = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function indexCsv(roomId: string) {
	const lines = [['number', 'type', 'title', 'folder', 'version', 'size_bytes']];
	for (const r of rows(roomId))
		lines.push([r.number, r.type, r.title, r.folder, r.version ?? '', r.size ?? ''].map(String));
	return `${lines.map((l) => l.map(cell).join(',')).join('\n')}\n`;
}

const latin = (text: string) => [...text].map((c) => (c.charCodeAt(0) < 256 ? c : '?')).join('');

export async function indexPdf(roomId: string, roomName: string) {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const width = 595;
	const height = 842;
	const margin = 50;
	let page = doc.addPage([width, height]);
	let y = height - margin;
	const line = (text: string, size: number, f = font, x = margin, color = rgb(0.1, 0.1, 0.1)) => {
		if (y < margin + size) {
			page = doc.addPage([width, height]);
			y = height - margin;
		}
		let t = latin(text);
		while (t.length > 3 && f.widthOfTextAtSize(t, size) > width - x - margin)
			t = `${t.slice(0, -4)}…`.replace('…', '...');
		page.drawText(t, { x, y, size, font: f, color });
		y -= size + 6;
	};
	line(`${roomName}: index`, 18, bold);
	line(
		`Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
		9,
		font,
		margin,
		rgb(0.45, 0.45, 0.45),
	);
	y -= 8;
	for (const r of rows(roomId)) {
		const indent = margin + r.depth * 14;
		line(
			`${r.number}  ${r.title}${r.type === 'Folder' ? '' : `  (${r.type})`}`,
			11,
			r.type === 'Folder' ? bold : font,
			indent,
		);
	}
	return Buffer.from(await doc.save());
}

export async function createIndexExport(
	roomId: string,
	roomName: string,
	format: 'csv' | 'pdf',
	userId: string,
) {
	const id = newId('exp');
	const key = `exports/${id}.${format}`;
	const body = format === 'csv' ? Buffer.from(indexCsv(roomId)) : await indexPdf(roomId, roomName);
	requireDiskSpace(body.length);
	mkdirSync(dirname(localPath(key)), { recursive: true });
	writeFileSync(localPath(key), body);
	const now = Date.now();
	const safe = roomName.replace(/[^\w .-]+/g, '-').slice(0, 80) || 'room';
	database()
		.sqlite.prepare(
			`INSERT INTO exports (id, kind, room_id, requested_by_user, status, progress, size, object_key, file_name, created_at, expires_at)
			VALUES (?, 'index', ?, ?, 'ready', 100, ?, ?, ?, ?, ?)`,
		)
		.run(id, roomId, userId, body.length, key, `${safe} index.${format}`, now, now + exportTtlMs);
	return id;
}
