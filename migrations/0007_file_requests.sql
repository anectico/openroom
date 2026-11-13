CREATE TABLE `file_request_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`viewer_id` text,
	`session_id` text,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`detected_type` text NOT NULL,
	`size` integer NOT NULL,
	`late` integer DEFAULT false NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `file_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_request_uploads_request` ON `file_request_uploads` (`request_id`,`uploaded_at`);--> statement-breakpoint
CREATE TABLE `file_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`max_size` integer NOT NULL,
	`due_at` integer,
	`closed_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_requests_room` ON `file_requests` (`room_id`);