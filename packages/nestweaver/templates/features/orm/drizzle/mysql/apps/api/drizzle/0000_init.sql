CREATE TABLE `companies` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(255),
	`email` varchar(255),
	`phone` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password` varchar(255),
	`role_ids` text,
	`session_version` int NOT NULL DEFAULT 0,
	`company_id` int,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `loom_permissions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`resource` varchar(255) NOT NULL,
	`ability` varchar(255) NOT NULL,
	`label` varchar(255),
	CONSTRAINT `loom_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `loom_permissions_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `loom_roles` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`permission_ids` text,
	CONSTRAINT `loom_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `loom_roles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;
