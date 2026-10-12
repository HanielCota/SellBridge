ALTER TABLE "listing_targets" ADD COLUMN "sync_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_targets" ADD COLUMN "sync_error" text;