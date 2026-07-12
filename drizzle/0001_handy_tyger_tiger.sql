CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`model_id` text NOT NULL,
	`status` text NOT NULL,
	`prompt` text NOT NULL,
	`output` text NOT NULL,
	`error` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_email_unique` ON `memberships` (`email`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`metric` text NOT NULL,
	`operator` text NOT NULL,
	`threshold` integer NOT NULL,
	`enforcement` text NOT NULL,
	`active` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
