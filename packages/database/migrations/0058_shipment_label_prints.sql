ALTER TABLE "order_shipments" ADD COLUMN "label_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "label_print_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "label_waiting_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_shipments" ADD COLUMN "marketplace_shipment_id" text;