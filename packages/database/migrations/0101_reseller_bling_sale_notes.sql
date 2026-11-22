CREATE TABLE "reseller_erp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" "erp_provider" NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"status" "store_connection_status" DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"account_name" text,
	"sale_notes_enabled_at" timestamp with time zone,
	"sale_note_settings" jsonb,
	"connected_by_user_id" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" DROP CONSTRAINT "shipment_reseller_invoices_source_check";--> statement-breakpoint
ALTER TABLE "erp_oauth_states" ALTER COLUMN "supplier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_oauth_states" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD COLUMN "erp_contact_id" bigint;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD COLUMN "erp_invoice_id" bigint;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD COLUMN "erp_draft_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD COLUMN "erp_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD COLUMN "erp_stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reseller_erp_connections" ADD CONSTRAINT "reseller_erp_connections_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_erp_connections" ADD CONSTRAINT "reseller_erp_connections_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_erp_connections_tenant_provider_idx" ON "reseller_erp_connections" USING btree ("tenant_id","provider");--> statement-breakpoint
CREATE INDEX "reseller_erp_connections_expiry_idx" ON "reseller_erp_connections" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "erp_oauth_states" ADD CONSTRAINT "erp_oauth_states_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_oauth_states" ADD CONSTRAINT "erp_oauth_states_owner_check" CHECK (("erp_oauth_states"."supplier_id" is null) <> ("erp_oauth_states"."tenant_id" is null));--> statement-breakpoint
ALTER TABLE "shipment_reseller_invoices" ADD CONSTRAINT "shipment_reseller_invoices_source_check" CHECK ("shipment_reseller_invoices"."source" is null or "shipment_reseller_invoices"."source" in ('marketplace', 'typed', 'uploaded', 'bling'));