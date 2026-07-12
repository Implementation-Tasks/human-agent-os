CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`requested_by` text NOT NULL,
	`risk_level` text NOT NULL,
	`status` text NOT NULL,
	`due_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`note` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`task_title` text NOT NULL,
	`worker_name` text NOT NULL,
	`route` text NOT NULL,
	`quality` real NOT NULL,
	`speed` real NOT NULL,
	`cost_efficiency` real NOT NULL,
	`oversight` real NOT NULL,
	`outcome` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`urgency` text NOT NULL,
	`risk` integer NOT NULL,
	`sensitivity` integer NOT NULL,
	`judgment` integer NOT NULL,
	`verifiability` integer NOT NULL,
	`route` text NOT NULL,
	`confidence` real NOT NULL,
	`status` text NOT NULL,
	`assignee` text NOT NULL,
	`assignee_ids` text NOT NULL,
	`rationale` text NOT NULL,
	`approval_required` integer NOT NULL,
	`progress` integer NOT NULL,
	`outcome_label` text NOT NULL,
	`estimated_hours` real NOT NULL,
	`predicted_savings_hours` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`description` text NOT NULL,
	`skills` text NOT NULL,
	`availability` integer NOT NULL,
	`cost_rate` integer NOT NULL,
	`reliability` real NOT NULL,
	`status` text NOT NULL,
	`initials` text NOT NULL,
	`accent` text NOT NULL
);
