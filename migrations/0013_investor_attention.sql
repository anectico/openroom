CREATE TABLE `investor_visits` (
	`scope` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`viewer_id` text,
	`session_id` text,
	`last_session_id` text NOT NULL,
	`baseline_json` text,
	`baseline_at` integer,
	`seen_json` text NOT NULL,
	`seen_at` integer NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`viewer_id`) REFERENCES `viewers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `viewer_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `message_reads` (
	`message_id` text NOT NULL,
	`scope` text NOT NULL,
	`viewer_id` text,
	`session_id` text,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `scope`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`viewer_id`) REFERENCES `viewers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `viewer_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
