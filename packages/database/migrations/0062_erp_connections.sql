CREATE TYPE "public"."erp_provider" AS ENUM('bling');--> statement-breakpoint
CREATE TABLE "erp_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"supplier_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"provider" "erp_provider" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_erp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"provider" "erp_provider" NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"status" "store_connection_status" DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"connected_by_user_id" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_oauth_states" ADD CONSTRAINT "erp_oauth_states_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_oauth_states" ADD CONSTRAINT "erp_oauth_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD CONSTRAINT "supplier_erp_connections_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD CONSTRAINT "supplier_erp_connections_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_erp_connections_supplier_provider_idx" ON "supplier_erp_connections" USING btree ("supplier_id","provider");--> statement-breakpoint
CREATE INDEX "supplier_erp_connections_expiry_idx" ON "supplier_erp_connections" USING btree ("status","expires_at");