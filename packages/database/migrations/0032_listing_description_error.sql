ALTER TABLE "listing_targets" ADD COLUMN "description_error" text;--> statement-breakpoint
ALTER TABLE "listing_targets" ADD COLUMN "description_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_targets" ADD COLUMN "description_attempts" integer DEFAULT 0 NOT NULL;