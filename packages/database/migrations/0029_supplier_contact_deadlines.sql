ALTER TABLE "suppliers" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "accept_within_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "dispatch_within_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_deadlines_check" CHECK ("suppliers"."accept_within_hours" between 1 and 720 and "suppliers"."dispatch_within_hours" between "suppliers"."accept_within_hours" and 720);