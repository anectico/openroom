import { json } from '@sveltejs/kit';
import { database } from '#lib/server/db/index.ts';
import { appVersion } from '#lib/server/paths.ts';

export function GET() {
	database().sqlite.prepare('SELECT 1').get();
	return json({ ok: true, version: appVersion }, { headers: { 'cache-control': 'no-store' } });
}
