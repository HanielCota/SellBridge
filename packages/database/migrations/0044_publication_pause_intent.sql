ALTER TABLE "listing_targets" ADD COLUMN "pause_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "listing_targets" SET "pause_requested" = true WHERE "status" = 'paused';
