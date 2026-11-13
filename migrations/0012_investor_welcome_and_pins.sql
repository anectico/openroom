CREATE TABLE `room_pins` (
	`file_id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_pins_order` ON `room_pins` (`room_id`,`position`);--> statement-breakpoint
ALTER TABLE `links` ADD `welcome_markdown` text;