import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { files, folders, links, rooms } from './core.ts';

export const groups = sqliteTable(
	'groups',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		defaultAccess: text('default_access', { enum: ['view', 'none'] })
			.notNull()
			.default('view'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('groups_room').on(t.roomId)],
);

export const groupPermissions = sqliteTable(
	'group_permissions',
	{
		id: text('id').primaryKey(),
		groupId: text('group_id')
			.notNull()
			.references(() => groups.id, { onDelete: 'cascade' }),
		folderId: text('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
		fileId: text('file_id').references(() => files.id, { onDelete: 'cascade' }),
		access: text('access', { enum: ['view', 'none'] }).notNull(),
	},
	(t) => [
		uniqueIndex('group_permissions_folder').on(t.groupId, t.folderId),
		uniqueIndex('group_permissions_file').on(t.groupId, t.fileId),
	],
);

export const linkGroups = sqliteTable('link_groups', {
	linkId: text('link_id')
		.primaryKey()
		.references(() => links.id, { onDelete: 'cascade' }),
	groupId: text('group_id')
		.notNull()
		.references(() => groups.id, { onDelete: 'cascade' }),
});

export const ndaVersions = sqliteTable(
	'nda_versions',
	{
		id: text('id').primaryKey(),
		roomId: text('room_id').notNull(),
		bodyMarkdown: text('body_markdown').notNull(),
		createdBy: text('created_by'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('nda_versions_room').on(t.roomId, t.createdAt)],
);

export const viewers = sqliteTable('viewers', {
	id: text('id').primaryKey(),
	email: text('email').unique(),
	emailHmac: text('email_hmac').notNull().unique(),
	name: text('name'),
	firstSeenAt: integer('first_seen_at').notNull(),
	erasedAt: integer('erased_at'),
});

export const gateProgress = sqliteTable(
	'gate_progress',
	{
		id: text('id').primaryKey(),
		linkId: text('link_id')
			.notNull()
			.references(() => links.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		viewerEmail: text('viewer_email'),
		allowed: integer('allowed', { mode: 'boolean' }).notNull().default(false),
		passwordOk: integer('password_ok', { mode: 'boolean' }).notNull().default(false),
		verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
		fields: text('fields_json', { mode: 'json' }).$type<Record<string, string>>(),
		ip: text('ip'),
		createdAt: integer('created_at').notNull(),
		expiresAt: integer('expires_at').notNull(),
	},
	(t) => [index('gate_progress_expiry').on(t.expiresAt)],
);

export const viewerSessions = sqliteTable(
	'viewer_sessions',
	{
		id: text('id').primaryKey(),
		linkId: text('link_id')
			.notNull()
			.references(() => links.id, { onDelete: 'cascade' }),
		viewerId: text('viewer_id').references(() => viewers.id, { onDelete: 'cascade' }),
		previewBy: text('preview_by'),
		tokenHash: text('token_hash').notNull().unique(),
		fields: text('fields_json', { mode: 'json' }).$type<Record<string, string>>(),
		verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
		ndaVersionId: text('nda_version_id'),
		ip: text('ip'),
		userAgent: text('user_agent'),
		lastSeenAt: integer('last_seen_at').notNull(),
		lastBeaconAt: integer('last_beacon_at'),
		creditedMs: integer('credited_ms').notNull().default(0),
		createdAt: integer('created_at').notNull(),
		expiresAt: integer('expires_at').notNull(),
		endedAt: integer('ended_at'),
	},
	(t) => [
		index('viewer_sessions_link').on(t.linkId, t.lastSeenAt),
		index('viewer_sessions_viewer').on(t.viewerId),
	],
);

export const verificationCodes = sqliteTable(
	'verification_codes',
	{
		id: text('id').primaryKey(),
		gateId: text('gate_id').notNull(),
		linkId: text('link_id').notNull(),
		viewerEmail: text('viewer_email').notNull(),
		ip: text('ip'),
		codeHash: text('code_hash'),
		attempts: integer('attempts').notNull().default(0),
		sentAt: integer('sent_at').notNull(),
		expiresAt: integer('expires_at').notNull(),
	},
	(t) => [
		index('verification_codes_email').on(t.viewerEmail, t.sentAt),
		index('verification_codes_link').on(t.linkId, t.sentAt),
		index('verification_codes_gate').on(t.gateId),
	],
);

export const ndaAcceptances = sqliteTable(
	'nda_acceptances',
	{
		id: text('id').primaryKey(),
		viewerId: text('viewer_id'),
		sessionId: text('session_id'),
		verified: integer('verified', { mode: 'boolean' }).notNull(),
		linkId: text('link_id'),
		roomId: text('room_id').notNull(),
		ndaVersionId: text('nda_version_id').notNull(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		ip: text('ip'),
		userAgent: text('user_agent'),
		acceptedAt: integer('accepted_at').notNull(),
	},
	(t) => [
		index('nda_acceptances_version').on(t.ndaVersionId),
		index('nda_acceptances_viewer').on(t.viewerId),
	],
);

export const exportsTable = sqliteTable(
	'exports',
	{
		id: text('id').primaryKey(),
		kind: text('kind', { enum: ['zip', 'archive', 'index', 'csv', 'viewer_data'] }).notNull(),
		roomId: text('room_id'),
		linkId: text('link_id'),
		requestedByUser: text('requested_by_user'),
		requestedBySession: text('requested_by_session'),
		status: text('status', { enum: ['pending', 'running', 'ready', 'failed'] }).notNull(),
		progress: integer('progress').notNull().default(0),
		size: integer('size'),
		error: text('error'),
		objectKey: text('object_key'),
		fileName: text('file_name').notNull(),
		fingerprint: text('fingerprint'),
		createdAt: integer('created_at').notNull(),
		expiresAt: integer('expires_at').notNull(),
	},
	(t) => [index('exports_session').on(t.requestedBySession), index('exports_expiry').on(t.expiresAt)],
);
