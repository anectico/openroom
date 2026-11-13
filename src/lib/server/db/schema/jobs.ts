import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const jobs = sqliteTable(
	'jobs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		kind: text('kind').notNull(),
		payload: text('payload', { mode: 'json' }).$type<unknown>().notNull().default({}),
		scheduleKey: text('schedule_key').unique(),
		runAt: integer('run_at').notNull(),
		attempts: integer('attempts').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(8),
		lockedAt: integer('locked_at'),
		lastError: text('last_error'),
		doneAt: integer('done_at'),
		failedAt: integer('failed_at'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('jobs_due').on(t.doneAt, t.failedAt, t.runAt)],
);

export const strayObjects = sqliteTable(
	'stray_objects',
	{
		key: text('key').notNull(),
		location: text('location', { enum: ['disk', 's3'] }).notNull(),
		firstSeenAt: integer('first_seen_at').notNull(),
	},
	(t) => [primaryKey({ columns: [t.key, t.location] }), index('stray_objects_age').on(t.firstSeenAt)],
);
