import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.ts';

export const pageReads = sqliteTable(
	'page_reads',
	{
		sessionId: text('session_id').notNull(),
		viewerId: text('viewer_id'),
		roomId: text('room_id').notNull(),
		fileId: text('file_id').notNull(),
		fileVersionId: text('file_version_id').notNull(),
		page: integer('page').notNull(),
		durationMs: integer('duration_ms').notNull().default(0),
		firstAt: integer('first_at').notNull(),
		lastAt: integer('last_at').notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.sessionId, t.fileVersionId, t.page] }),
		index('page_reads_room').on(t.roomId, t.fileId),
		index('page_reads_file').on(t.fileId, t.lastAt),
		index('page_reads_viewer').on(t.viewerId),
	],
);

export const videoReads = sqliteTable(
	'video_reads',
	{
		sessionId: text('session_id').notNull(),
		viewerId: text('viewer_id'),
		roomId: text('room_id').notNull(),
		fileId: text('file_id').notNull(),
		fileVersionId: text('file_version_id').notNull(),
		watchedRanges: text('watched_ranges_json', { mode: 'json' }).$type<[number, number][]>().notNull(),
		watchedMs: integer('watched_ms').notNull().default(0),
		durationMs: integer('duration_ms'),
		lastAt: integer('last_at').notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.sessionId, t.fileVersionId] }),
		index('video_reads_room').on(t.roomId, t.fileId),
	],
);

export const events = sqliteTable(
	'events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		kind: text('kind').notNull(),
		roomId: text('room_id').notNull(),
		linkId: text('link_id'),
		viewerId: text('viewer_id'),
		sessionId: text('session_id'),
		fileId: text('file_id'),
		fileVersionId: text('file_version_id'),
		detail: text('detail_json', { mode: 'json' }).$type<Record<string, unknown>>(),
		at: integer('at').notNull(),
	},
	(t) => [
		index('events_room_at').on(t.roomId, t.at),
		index('events_viewer').on(t.viewerId),
		index('events_kind').on(t.kind, t.roomId),
	],
);

export const notices = sqliteTable(
	'notices',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		event: text('event').notNull(),
		roomId: text('room_id'),
		linkId: text('link_id'),
		viewerId: text('viewer_id'),
		fileId: text('file_id'),
		detail: text('detail_json', { mode: 'json' }).$type<Record<string, unknown>>(),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [
		index('notices_created').on(t.createdAt),
		index('notices_viewer').on(t.viewerId),
		index('notices_room').on(t.roomId),
	],
);

export const noticeReads = sqliteTable(
	'notice_reads',
	{
		noticeId: integer('notice_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		readAt: integer('read_at').notNull(),
	},
	(t) => [primaryKey({ columns: [t.noticeId, t.userId] })],
);

export const notificationPrefs = sqliteTable(
	'notification_prefs',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		event: text('event').notNull(),
		email: integer('email', { mode: 'boolean' }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.event] })],
);
