CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`format` text NOT NULL,
	`host` text NOT NULL,
	`url_enc` text NOT NULL,
	`secret_enc` text NOT NULL,
	`events` text,
	`last_status` integer,
	`last_error` text,
	`last_sent_at` integer,
	`disabled_at` integer,
	`created_at` integer NOT NULL
);
