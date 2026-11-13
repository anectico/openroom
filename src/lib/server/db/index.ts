import { drizzle } from 'drizzle-orm/better-sqlite3';
import { dbPath } from '../paths.ts';
import { openSqlite, type Sqlite } from './connection.ts';
import * as schema from './schema/index.ts';

type Handle = { sqlite: Sqlite; db: ReturnType<typeof drizzle<typeof schema>> };

const key = Symbol.for('openroom.db');
const store = globalThis as typeof globalThis & { [key]?: Handle };

export function database(): Handle {
	if (!store[key]) {
		const sqlite = openSqlite(dbPath);
		store[key] = { sqlite, db: drizzle(sqlite, { schema }) };
	}
	return store[key];
}

export function closeDatabase() {
	store[key]?.sqlite.close();
	store[key] = undefined;
}

export { schema };
