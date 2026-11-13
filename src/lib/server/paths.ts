import { resolve } from 'node:path';

export const dataDir = resolve(process.env.DATA_DIR ?? 'data');
export const dbDir = resolve(dataDir, 'db');
export const dbPath = resolve(dbDir, 'openroom.db');
export const snapshotDir = resolve(dataDir, 'snapshots');
export const localReplicaDir = resolve(dataDir, 'replica');
export const rollbackMarkerPath = resolve(dataDir, 'rollback.json');
export const migrationsDir = resolve(process.env.MIGRATIONS_DIR ?? 'migrations');
export const appVersion = process.env.OPENROOM_VERSION ?? 'dev';
