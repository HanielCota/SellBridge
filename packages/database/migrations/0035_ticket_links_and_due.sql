ALTER TABLE "tickets" ADD COLUMN "response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "store_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "listing_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Tickets already waiting keep the calendar-hours deadline they had (RESPONSE_TARGET_HOURS);
-- business hours apply from the next time a ticket starts waiting (item 27.b).
UPDATE "tickets" SET "response_due_at" = "awaiting_since" + CASE "priority" WHEN 'urgent' THEN interval '2 hours' WHEN 'high' THEN interval '8 hours' WHEN 'low' THEN interval '48 hours' ELSE interval '24 hours' END WHERE "awaiting_since" IS NOT NULL;
