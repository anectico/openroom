CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`schedule_key` text,
	`run_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 8 NOT NULL,
	`locked_at` integer,
	`last_error` text,
	`done_at` integer,
	`failed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_schedule_key_unique` ON `jobs` (`schedule_key`);--> statement-breakpoint
CREATE INDEX `jobs_due` ON `jobs` (`done_at`,`failed_at`,`run_at`);