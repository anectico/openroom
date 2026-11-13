CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`room_id` text NOT NULL,
	`link_id` text,
	`viewer_id` text,
	`session_id` text,
	`file_id` text,
	`file_version_id` text,
	`detail_json` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_room_at` ON `events` (`room_id`,`at`);--> statement-breakpoint
CREATE INDEX `events_viewer` ON `events` (`viewer_id`);--> statement-breakpoint
CREATE INDEX `events_kind` ON `events` (`kind`,`room_id`);--> statement-breakpoint
CREATE TABLE `notice_reads` (
	`notice_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`notice_id`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event` text NOT NULL,
	`room_id` text,
	`link_id` text,
	`viewer_id` text,
	`file_id` text,
	`detail_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notices_created` ON `notices` (`created_at`);--> statement-breakpoint
CREATE INDEX `notices_viewer` ON `notices` (`viewer_id`);--> statement-breakpoint
CREATE INDEX `notices_room` ON `notices` (`room_id`);--> statement-breakpoint
CREATE TABLE `notification_prefs` (
	`user_id` text NOT NULL,
	`event` text NOT NULL,
	`email` integer NOT NULL,
	PRIMARY KEY(`user_id`, `event`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `page_reads` (
	`session_id` text NOT NULL,
	`viewer_id` text,
	`room_id` text NOT NULL,
	`file_id` text NOT NULL,
	`file_version_id` text NOT NULL,
	`page` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `file_version_id`, `page`)
);
--> statement-breakpoint
CREATE INDEX `page_reads_room` ON `page_reads` (`room_id`,`file_id`);--> statement-breakpoint
CREATE INDEX `page_reads_file` ON `page_reads` (`file_id`,`last_at`);--> statement-breakpoint
CREATE INDEX `page_reads_viewer` ON `page_reads` (`viewer_id`);--> statement-breakpoint
CREATE TABLE `video_reads` (
	`session_id` text NOT NULL,
	`viewer_id` text,
	`room_id` text NOT NULL,
	`file_id` text NOT NULL,
	`file_version_id` text NOT NULL,
	`watched_ranges_json` text NOT NULL,
	`watched_ms` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`last_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `file_version_id`)
);
--> statement-breakpoint
CREATE INDEX `video_reads_room` ON `video_reads` (`room_id`,`file_id`);--> statement-breakpoint
ALTER TABLE `viewer_sessions` ADD `last_beacon_at` integer;--> statement-breakpoint
ALTER TABLE `viewer_sessions` ADD `credited_ms` integer DEFAULT 0 NOT NULL;