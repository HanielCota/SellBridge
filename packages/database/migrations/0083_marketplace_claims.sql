ALTER TYPE "public"."problem_area" ADD VALUE 'claims' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "marketplace_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"external_claim_id" text NOT NULL,
	"status" text NOT NULL,
	"type" text NOT NULL,
	"stage" text NOT NULL,
	"reason_id" text,
	"problem" text,
	"action_responsible" text,
	"action_due_at" timestamp with time zone,
	"resolution_reason" text,
	"closed_at" timestamp with time zone,
	"return_status" text,
	"return_tracking_code" text,
	"return_destination" text,
	"money_status" text,
	"opened_at" timestamp with time zone NOT NULL,
	"marketplace_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_claims_status_check" CHECK ("marketplace_claims"."status" in ('opened','closed'))
);
--> statement-breakpoint
ALTER TABLE "store_connections" ADD COLUMN "last_shipment_notice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_claims" ADD CONSTRAINT "marketplace_claims_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_claims" ADD CONSTRAINT "marketplace_claims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_claims" ADD CONSTRAINT "marketplace_claims_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_claims_external_idx" ON "marketplace_claims" USING btree ("marketplace","external_claim_id");--> statement-breakpoint
CREATE INDEX "marketplace_claims_tenant_order_idx" ON "marketplace_claims" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "marketplace_claims_open_idx" ON "marketplace_claims" USING btree ("tenant_id","order_id") WHERE "marketplace_claims"."status" = 'opened';