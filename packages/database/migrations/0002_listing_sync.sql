ALTER TABLE "listing_targets" ADD COLUMN "synced_stock" integer;--> statement-breakpoint
ALTER TABLE "listing_targets" ADD COLUMN "synced_price_cents" integer;--> statement-breakpoint
ALTER TABLE "listing_targets" ADD COLUMN "synced_at" timestamp with time zone;