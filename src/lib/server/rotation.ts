import { writeAudit } from './audit.ts';
import { database } from './db/index.ts';
import { decrypt, encrypt, encryptedWithCurrentKey, SecretKeyError } from './secrets.ts';

const columns = [
	{ table: 'settings', key: 'key', column: 'value_enc' },
	{ table: 'links', key: 'id', column: 'token_enc' },
	{ table: 'webhooks', key: 'id', column: 'secret_enc' },
	{ table: 'webhooks', key: 'id', column: 'url_enc' },
];

export function reencryptAll() {
	const sqlite = database().sqlite;
	let changed = 0;
	sqlite
		.transaction(() => {
			for (const c of columns) {
				const rows = sqlite
					.prepare(
						`SELECT ${c.key} AS id, ${c.column} AS value FROM ${c.table} WHERE ${c.column} IS NOT NULL`,
					)
					.all() as {
					id: string;
					value: string;
				}[];
				const update = sqlite.prepare(`UPDATE ${c.table} SET ${c.column} = ? WHERE ${c.key} = ?`);
				for (const r of rows) {
					if (encryptedWithCurrentKey(r.value)) continue;
					let plain: string;
					try {
						plain = decrypt(r.value);
					} catch {
						throw new SecretKeyError(
							'OPENROOM_SECRET_KEY does not match the key the data was saved with. Restore the old key, or set it as OPENROOM_SECRET_KEY_PREVIOUS to rotate.',
						);
					}
					update.run(encrypt(plain), r.id);
					changed++;
				}
			}
		})
		.immediate();
	if (changed)
		writeAudit({
			operation: 'server.key_rotation',
			targetType: 'settings',
			targetId: null,
			detail: { reencrypted: changed },
		});
	return changed;
}
