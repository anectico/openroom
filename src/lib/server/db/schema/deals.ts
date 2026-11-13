import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { rooms } from './core.ts';

export const conversations = sqliteTable(
	'conversations',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		viewerId: text('viewer_id'),
		sessionId: text('session_id'),
		linkId: text('link_id'),
		fileId: text('file_id'),
		page: integer('page'),
		lastMessageAt: integer('last_message_at').notNull(),
		lastAuthor: text('last_author', { enum: ['viewer', 'member'] }).notNull(),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [
		index('conversations_room').on(t.roomId, t.lastMessageAt),
		index('conversations_viewer').on(t.viewerId, t.roomId),
	],
);

export const messages = sqliteTable(
	'messages',
	{
		id: text('id').primaryKey(),
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		author: text('author').notNull(),
		sessionId: text('session_id'),
		body: text('body').notNull(),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('messages_conversation').on(t.conversationId, t.createdAt)],
);

export const faqEntries = sqliteTable(
	'faq_entries',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		question: text('question').notNull(),
		answerMarkdown: text('answer_markdown').notNull(),
		position: integer('position').notNull(),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('faq_room').on(t.roomId, t.position)],
);

export const fileRequests = sqliteTable(
	'file_requests',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		targetKind: text('target_kind', { enum: ['viewer', 'link', 'group'] }).notNull(),
		targetId: text('target_id').notNull(),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		maxSize: integer('max_size').notNull(),
		dueAt: integer('due_at'),
		closedAt: integer('closed_at'),
		createdBy: text('created_by'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('file_requests_room').on(t.roomId)],
);

export const fileRequestUploads = sqliteTable(
	'file_request_uploads',
	{
		id: text('id').primaryKey(),
		requestId: text('request_id')
			.notNull()
			.references(() => fileRequests.id, { onDelete: 'cascade' }),
		viewerId: text('viewer_id'),
		sessionId: text('session_id'),
		objectKey: text('object_key').notNull(),
		originalName: text('original_name').notNull(),
		detectedType: text('detected_type').notNull(),
		size: integer('size').notNull(),
		late: integer('late', { mode: 'boolean' }).notNull().default(false),
		uploadedAt: integer('uploaded_at').notNull(),
	},
	(t) => [index('file_request_uploads_request').on(t.requestId, t.uploadedAt)],
);

export const webhooks = sqliteTable('webhooks', {
	id: text('id').primaryKey(),
	format: text('format', { enum: ['generic', 'slack'] }).notNull(),
	host: text('host').notNull(),
	urlEnc: text('url_enc').notNull(),
	secretEnc: text('secret_enc').notNull(),
	events: text('events', { mode: 'json' }).$type<string[] | null>(),
	lastStatus: integer('last_status'),
	lastError: text('last_error'),
	lastSentAt: integer('last_sent_at'),
	disabledAt: integer('disabled_at'),
	createdAt: integer('created_at').notNull(),
});
