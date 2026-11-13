import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dbPath } from '../lib/server/paths.ts';
import { litestreamSocketPath } from './replica.ts';

const run = promisify(execFile);

export async function probeReplication() {
	try {
		const result = await run(
			process.env.LITESTREAM_BIN ?? 'litestream',
			['sync', '-socket', litestreamSocketPath, '-wait', '-timeout', '10', '-json', dbPath],
			{ timeout: 15_000, maxBuffer: 64 * 1024 },
		);
		const data = JSON.parse(result.stdout) as { txid?: number; replica_txid?: number };
		if (data.txid === undefined || data.replica_txid === undefined || data.txid !== data.replica_txid)
			throw new Error('not_synced');
		return { ok: true, checkedAt: Date.now(), error: null };
	} catch {
		return {
			ok: false,
			checkedAt: Date.now(),
			error: 'Litestream has not confirmed a database backup. Check its logs, the bucket and credentials.',
		};
	}
}
