DROP INDEX "shipment_invoices_shipment_idx";--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD COLUMN "kind" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD COLUMN "erp_draft_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "on_behalf_shipment_operation_id" bigint;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "on_behalf_sale_operation_id" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_invoices_shipment_kind_idx" ON "shipment_invoices" USING btree ("shipment_id","kind");--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD CONSTRAINT "shipment_invoices_kind_check" CHECK ("shipment_invoices"."kind" in ('direct','on_behalf_shipment','on_behalf_sale'));