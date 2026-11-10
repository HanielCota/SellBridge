CREATE TYPE "public"."payment_provider" AS ENUM('mercado_pago');--> statement-breakpoint
CREATE TABLE "payment_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"supplier_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"payment_fee_basis_points" integer,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_single_row_check" CHECK ("platform_settings"."id" = 1),
	CONSTRAINT "platform_settings_payment_fee_check" CHECK ("platform_settings"."payment_fee_basis_points" is null or ("platform_settings"."payment_fee_basis_points" >= 0 and "platform_settings"."payment_fee_basis_points" <= 3000))
);
--> statement-breakpoint
CREATE TABLE "shipment_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"platform_fee_basis_points" integer NOT NULL,
	"preference_id" text,
	"checkout_url" text,
	"checkout_expires_at" timestamp with time zone,
	"provider_payment_id" text,
	"payment_method" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_payments_status_check" CHECK ("shipment_payments"."status" in ('pending','in_process','approved','rejected','cancelled','refunded','charged_back')),
	CONSTRAINT "shipment_payments_amount_check" CHECK ("shipment_payments"."amount_cents" > 0),
	CONSTRAINT "shipment_payments_fee_check" CHECK ("shipment_payments"."platform_fee_cents" >= 0 and "shipment_payments"."platform_fee_cents" <= "shipment_payments"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"status" "store_connection_status" DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"provider_account_id" text,
	"connected_by_user_id" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_oauth_states" ADD CONSTRAINT "payment_oauth_states_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_oauth_states" ADD CONSTRAINT "payment_oauth_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD CONSTRAINT "shipment_payments_shipment_id_order_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."order_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD CONSTRAINT "shipment_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_accounts" ADD CONSTRAINT "supplier_payment_accounts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_accounts" ADD CONSTRAINT "supplier_payment_accounts_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_payments_shipment_idx" ON "shipment_payments" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_payments_provider_payment_idx" ON "shipment_payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_payment_accounts_supplier_provider_idx" ON "supplier_payment_accounts" USING btree ("supplier_id","provider");--> statement-breakpoint
CREATE INDEX "supplier_payment_accounts_provider_account_idx" ON "supplier_payment_accounts" USING btree ("provider","provider_account_id");