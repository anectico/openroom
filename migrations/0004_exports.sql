CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`room_id` text,
	`link_id` text,
	`requested_by_user` text,
	`requested_by_session` text,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`size` integer,
	`error` text,
	`object_key` text,
	`file_name` text NOT NULL,
	`fingerprint` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exports_session` ON `exports` (`requested_by_session`);--> statement-breakpoint
CREATE INDEX `exports_expiry` ON `exports` (`expires_at`);