CREATE TABLE "shipment_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"provider" "erp_provider" NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"erp_contact_id" bigint,
	"erp_order_id" bigint,
	"erp_invoice_id" bigint,
	"number" text,
	"series" text,
	"access_key" text,
	"danfe_url" text,
	"problem" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_invoices_status_check" CHECK ("shipment_invoices"."status" in ('queued','sent','authorized','attention','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "invoice_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "invoice_recipient" text DEFAULT 'buyer' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD CONSTRAINT "shipment_invoices_shipment_id_order_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."order_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_invoices" ADD CONSTRAINT "shipment_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_invoices_shipment_idx" ON "shipment_invoices" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_invoices_due_idx" ON "shipment_invoices" USING btree ("next_attempt_at") WHERE "shipment_invoices"."status" in ('queued','sent');--> statement-breakpoint
CREATE INDEX "shipment_invoices_supplier_idx" ON "shipment_invoices" USING btree ("supplier_id");--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD CONSTRAINT "supplier_erp_connections_invoice_recipient_check" CHECK ("supplier_erp_connections"."invoice_recipient" in ('buyer','reseller'));