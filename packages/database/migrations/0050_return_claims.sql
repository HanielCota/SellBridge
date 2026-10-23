CREATE TABLE "return_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_tenant_id" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"ticket_id" uuid,
	"status" text DEFAULT 'in_review' NOT NULL,
	"supplier_cost_cents" integer NOT NULL,
	"credited_cents" integer,
	"refusal_reason" text,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_claims_status_check" CHECK ("return_claims"."status" in ('in_review','credited','refused')),
	CONSTRAINT "return_claims_credit_check" CHECK ("return_claims"."supplier_cost_cents" >= 0 and ("return_claims"."credited_cents" is null or "return_claims"."credited_cents" between 1 and "return_claims"."supplier_cost_cents"))
);
--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_shipment_id_order_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."order_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_seller_tenant_id_organization_id_fk" FOREIGN KEY ("seller_tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "return_claims_shipment_idx" ON "return_claims" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "return_claims_ticket_idx" ON "return_claims" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "return_claims_seller_order_idx" ON "return_claims" USING btree ("seller_tenant_id","order_id");