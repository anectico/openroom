import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.ts';

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value'),
	valueEnc: text('value_enc'),
	updatedAt: integer('updated_at').notNull(),
});

export const auditLog = sqliteTable(
	'audit_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id'),
		apiKeyId: text('api_key_id'),
		roomId: text('room_id'),
		operation: text('operation').notNull(),
		targetType: text('target_type'),
		targetId: text('target_id'),
		detail: text('detail_json', { mode: 'json' }).$type<Record<string, unknown>>(),
		at: integer('at').notNull(),
	},
	(t) => [index('audit_room_at').on(t.roomId, t.at), index('audit_at').on(t.at)],
);

export const memberInvites = sqliteTable(
	'member_invites',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		role: text('role', { enum: ['owner', 'admin', 'observer'] }).notNull(),
		invitedBy: text('invited_by'),
		expiresAt: integer('expires_at').notNull(),
		acceptedAt: integer('accepted_at'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('member_invites_user').on(t.userId)],
);

export const objects = sqliteTable('objects', {
	key: text('key').primaryKey(),
	location: text('location', { enum: ['disk', 's3'] }).notNull(),
	size: integer('size').notNull(),
	sha256: text('sha256').notNull(),
	refcount: integer('refcount').notNull().default(0),
	releasedAt: integer('released_at'),
	createdAt: integer('created_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	defaults: text('defaults_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
	logoObjectKey: text('logo_object_key').references(() => objects.key),
	accentColor: text('accent_color'),
	welcomeMarkdown: text('welcome_markdown').notNull().default(''),
	currentNdaVersionId: text('current_nda_version_id'),
	frozenAt: integer('frozen_at'),
	frozenRetentionDays: integer('frozen_retention_days').notNull().default(730),
	createdAt: integer('created_at').notNull(),
});

export const folders = sqliteTable(
	'folders',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		parentId: text('parent_id'),
		name: text('name').notNull(),
		position: integer('position').notNull(),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('folders_parent').on(t.roomId, t.parentId, t.position)],
);

export const files = sqliteTable(
	'files',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		folderId: text('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['pdf', 'image', 'video', 'download'] }).notNull(),
		title: text('title').notNull(),
		position: integer('position').notNull(),
		currentVersion: integer('current_version').notNull(),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('files_folder').on(t.roomId, t.folderId, t.position)],
);

export const roomPins = sqliteTable(
	'room_pins',
	{
		fileId: text('file_id')
			.primaryKey()
			.references(() => files.id, { onDelete: 'cascade' }),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
	},
	(t) => [uniqueIndex('room_pins_order').on(t.roomId, t.position)],
);

export const fileVersions = sqliteTable(
	'file_versions',
	{
		id: text('id').primaryKey(),
		fileId: text('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		version: integer('version').notNull(),
		objectKey: text('object_key')
			.notNull()
			.references(() => objects.key),
		originalName: text('original_name').notNull(),
		contentType: text('content_type').notNull(),
		size: integer('size').notNull(),
		pages: integer('pages'),
		durationMs: integer('duration_ms'),
		createdBy: text('created_by'),
		createdAt: integer('created_at').notNull(),
		deletedAt: integer('deleted_at'),
	},
	(t) => [uniqueIndex('file_versions_number').on(t.fileId, t.version)],
);

export const uploads = sqliteTable(
	'uploads',
	{
		id: text('id').primaryKey(),
		tokenHash: text('token_hash').notNull().unique(),
		createdBy: text('created_by').notNull(),
		clientIp: text('client_ip'),
		target: text('target', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		originalName: text('original_name').notNull(),
		expectedSize: integer('expected_size').notNull(),
		expectedSha256: text('expected_sha256'),
		receivedSize: integer('received_size'),
		sha256: text('sha256'),
		inProgressSince: integer('in_progress_since'),
		objectKey: text('object_key').notNull(),
		location: text('location', { enum: ['disk', 's3'] })
			.notNull()
			.default('disk'),
		expiresAt: integer('expires_at').notNull(),
		finishedAt: integer('finished_at'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('uploads_expiry').on(t.finishedAt, t.expiresAt)],
);

export const links = sqliteTable(
	'links',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		tokenEnc: text('token_enc').notNull(),
		open: integer('open', { mode: 'boolean' }).notNull().default(false),
		label: text('label').notNull(),
		welcomeMarkdown: text('welcome_markdown'),
		passwordHash: text('password_hash'),
		settings: text('settings_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		invitedAt: integer('invited_at'),
		expiresAt: integer('expires_at'),
		revokedAt: integer('revoked_at'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('links_room').on(t.roomId)],
);

export const linkAllow = sqliteTable(
	'link_allow',
	{
		id: text('id').primaryKey(),
		linkId: text('link_id')
			.notNull()
			.references(() => links.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['email', 'domain'] }).notNull(),
		value: text('value').notNull(),
	},
	(t) => [uniqueIndex('link_allow_value').on(t.linkId, t.kind, t.value)],
);

export const blocks = sqliteTable(
	'blocks',
	{
		id: text('id').primaryKey(),
		linkId: text('link_id').references(() => links.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['email', 'domain'] }).notNull(),
		value: text('value').notNull(),
		display: text('display'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('blocks_value').on(t.kind, t.value)],
);
