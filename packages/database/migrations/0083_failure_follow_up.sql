ALTER TABLE "webhook_events" ADD COLUMN "abandoned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "catalog_export_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "catalog_export_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "catalog_export_result" jsonb;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "provider_deferred_since" timestamp with time zone;