CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`viewer_id` text,
	`session_id` text,
	`link_id` text,
	`file_id` text,
	`page` integer,
	`last_message_at` integer NOT NULL,
	`last_author` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_room` ON `conversations` (`room_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_viewer` ON `conversations` (`viewer_id`,`room_id`);--> statement-breakpoint
CREATE TABLE `faq_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`question` text NOT NULL,
	`answer_markdown` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `faq_room` ON `faq_entries` (`room_id`,`position`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`author` text NOT NULL,
	`session_id` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation` ON `messages` (`conversation_id`,`created_at`);