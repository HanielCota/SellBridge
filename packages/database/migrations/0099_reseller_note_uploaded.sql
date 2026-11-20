ALTER TABLE "shipment_reseller_invoices" DROP CONSTRAINT "shipment_reseller_invoices_source_check";--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD COLUMN "label_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD COLUMN "label_released_by_user_id" text;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD COLUMN "label_release_reason" text;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD CONSTRAINT "shipment_reseller_invoices_label_released_by_user_id_user_id_fk" FOREIGN KEY ("label_released_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD CONSTRAINT "shipment_reseller_invoices_source_check" CHECK ("shipment_reseller_invoices"."source" is null or "shipment_reseller_invoices"."source" in ('marketplace', 'typed', 'uploaded'));