CREATE TABLE `gate_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`viewer_email` text,
	`allowed` integer DEFAULT false NOT NULL,
	`password_ok` integer DEFAULT false NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`fields_json` text,
	`ip` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gate_progress_token_hash_unique` ON `gate_progress` (`token_hash`);--> statement-breakpoint
CREATE INDEX `gate_progress_expiry` ON `gate_progress` (`expires_at`);--> statement-breakpoint
CREATE TABLE `group_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`folder_id` text,
	`file_id` text,
	`access` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_permissions_folder` ON `group_permissions` (`group_id`,`folder_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `group_permissions_file` ON `group_permissions` (`group_id`,`file_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`default_access` text DEFAULT 'view' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `groups_room` ON `groups` (`room_id`);--> statement-breakpoint
CREATE TABLE `link_groups` (
	`link_id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `nda_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text,
	`session_id` text,
	`verified` integer NOT NULL,
	`link_id` text,
	`room_id` text NOT NULL,
	`nda_version_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`accepted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nda_acceptances_version` ON `nda_acceptances` (`nda_version_id`);--> statement-breakpoint
CREATE INDEX `nda_acceptances_viewer` ON `nda_acceptances` (`viewer_id`);--> statement-breakpoint
CREATE TABLE `nda_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`body_markdown` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nda_versions_room` ON `nda_versions` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`gate_id` text NOT NULL,
	`link_id` text NOT NULL,
	`viewer_email` text NOT NULL,
	`ip` text,
	`code_hash` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_codes_email` ON `verification_codes` (`viewer_email`,`sent_at`);--> statement-breakpoint
CREATE INDEX `verification_codes_link` ON `verification_codes` (`link_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `verification_codes_gate` ON `verification_codes` (`gate_id`);--> statement-breakpoint
CREATE TABLE `viewer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`viewer_id` text,
	`preview_by` text,
	`token_hash` text NOT NULL,
	`fields_json` text,
	`verified` integer DEFAULT false NOT NULL,
	`nda_version_id` text,
	`ip` text,
	`user_agent` text,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`viewer_id`) REFERENCES `viewers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `viewer_sessions_token_hash_unique` ON `viewer_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `viewer_sessions_link` ON `viewer_sessions` (`link_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `viewer_sessions_viewer` ON `viewer_sessions` (`viewer_id`);--> statement-breakpoint
CREATE TABLE `viewers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`email_hmac` text NOT NULL,
	`name` text,
	`first_seen_at` integer NOT NULL,
	`erased_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `viewers_email_unique` ON `viewers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `viewers_email_hmac_unique` ON `viewers` (`email_hmac`);