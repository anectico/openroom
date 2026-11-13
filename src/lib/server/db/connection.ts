import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Sqlite = Database.Database;

export function openSqlite(
	path: string,
	options: { foreignKeys?: boolean; readonly?: boolean } = {},
): Sqlite {
	if (!options.readonly) mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path, {
		readonly: options.readonly ?? false,
		fileMustExist: options.readonly ?? false,
	});
	db.pragma('busy_timeout = 5000');
	if (!options.readonly) db.pragma('journal_mode = WAL');
	db.pragma('wal_autocheckpoint = 0');
	db.pragma('synchronous = NORMAL');
	db.pragma(`foreign_keys = ${options.foreignKeys === false ? 'OFF' : 'ON'}`);
	return db;
}
