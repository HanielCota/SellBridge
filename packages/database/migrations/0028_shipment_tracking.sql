ALTER TABLE "order_shipments" ADD COLUMN "estimated_delivery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "dispatch_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "tracked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "order_shipments_tracking_idx" ON "order_shipments" USING btree ("tracked_at" NULLS FIRST) WHERE "order_shipments"."status" in ('forwarded','accepted','picking','ready','shipped');