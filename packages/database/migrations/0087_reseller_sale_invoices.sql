CREATE TABLE "shipment_reseller_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"access_key" text,
	"number" text,
	"series" text,
	"issued_at" timestamp with time zone,
	"source" text,
	"found_at" timestamp with time zone,
	"problem" text,
	"checks" integer DEFAULT 0 NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_reseller_invoices_source_check" CHECK ("shipment_reseller_invoices"."source" is null or "shipment_reseller_invoices"."source" in ('marketplace', 'typed')),
	CONSTRAINT "shipment_reseller_invoices_found_check" CHECK (("shipment_reseller_invoices"."access_key" is null) = ("shipment_reseller_invoices"."source" is null))
);
--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD CONSTRAINT "shipment_reseller_invoices_shipment_id_order_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."order_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD CONSTRAINT "shipment_reseller_invoices_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_reseller_invoices_shipment_idx" ON "shipment_reseller_invoices" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_reseller_invoices_due_idx" ON "shipment_reseller_invoices" USING btree ("next_check_at") WHERE "shipment_reseller_invoices"."access_key" is null;--> statement-breakpoint
CREATE INDEX "shipment_reseller_invoices_tenant_idx" ON "shipment_reseller_invoices" USING btree ("tenant_id");