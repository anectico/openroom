CREATE TABLE `document_reviews` (
	`scope` text NOT NULL,
	`file_id` text NOT NULL,
	`viewer_id` text,
	`session_id` text,
	`version` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `file_id`),
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`viewer_id`) REFERENCES `viewers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `viewer_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
