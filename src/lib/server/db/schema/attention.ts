import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { viewerSessions, viewers } from './access.ts';
import { files, links } from './core.ts';
import { messages } from './deals.ts';

export const investorVisits = sqliteTable('investor_visits', {
	scope: text('scope').primaryKey(),
	linkId: text('link_id')
		.notNull()
		.references(() => links.id, { onDelete: 'cascade' }),
	viewerId: text('viewer_id').references(() => viewers.id, { onDelete: 'cascade' }),
	sessionId: text('session_id').references(() => viewerSessions.id, { onDelete: 'cascade' }),
	lastSessionId: text('last_session_id').notNull(),
	baseline: text('baseline_json'),
	baselineAt: integer('baseline_at'),
	seen: text('seen_json').notNull(),
	seenAt: integer('seen_at').notNull(),
});

export const messageReads = sqliteTable(
	'message_reads',
	{
		messageId: text('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		scope: text('scope').notNull(),
		viewerId: text('viewer_id').references(() => viewers.id, { onDelete: 'cascade' }),
		sessionId: text('session_id').references(() => viewerSessions.id, { onDelete: 'cascade' }),
		readAt: integer('read_at').notNull(),
	},
	(t) => [primaryKey({ columns: [t.messageId, t.scope] })],
);

export const documentReviews = sqliteTable(
	'document_reviews',
	{
		scope: text('scope').notNull(),
		fileId: text('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		viewerId: text('viewer_id').references(() => viewers.id, { onDelete: 'cascade' }),
		sessionId: text('session_id').references(() => viewerSessions.id, { onDelete: 'cascade' }),
		version: integer('version').notNull(),
		reviewedAt: integer('reviewed_at').notNull(),
	},
	(t) => [primaryKey({ columns: [t.scope, t.fileId] })],
);
