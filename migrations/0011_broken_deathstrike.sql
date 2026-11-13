CREATE TABLE `stray_objects` (
	`key` text NOT NULL,
	`location` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	PRIMARY KEY(`key`, `location`)
);
--> statement-breakpoint
CREATE INDEX `stray_objects_age` ON `stray_objects` (`first_seen_at`);