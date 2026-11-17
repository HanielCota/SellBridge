ALTER TYPE "public"."payment_provider" ADD VALUE 'asaas';--> statement-breakpoint
CREATE TABLE "supplier_payment_choices" (
	"supplier_id" uuid PRIMARY KEY NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"chosen_by_user_id" text,
	"chosen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_payments" DROP CONSTRAINT "shipment_payments_refund_reason_check";--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "new_supplier_protection" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "new_supplier_deliveries" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "escrow_id" text;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "escrow_status" text;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "escrow_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "release_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "team_decision" text;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "team_decision_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "team_decision_by_user_id" text;--> statement-breakpoint
ALTER TABLE "supplier_payment_accounts" ADD COLUMN "wallet_id" text;--> statement-breakpoint
ALTER TABLE "supplier_payment_accounts" ADD COLUMN "review_status" text;--> statement-breakpoint
ALTER TABLE "supplier_payment_choices" ADD CONSTRAINT "supplier_payment_choices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_choices" ADD CONSTRAINT "supplier_payment_choices_chosen_by_user_id_user_id_fk" FOREIGN KEY ("chosen_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD CONSTRAINT "shipment_payments_team_decision_by_user_id_user_id_fk" FOREIGN KEY ("team_decision_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_payments_held_idx" ON "shipment_payments" USING btree ("checked_at" NULLS FIRST,"id") WHERE "shipment_payments"."status" in ('approved','charged_back') and "shipment_payments"."released_at" is null and "shipment_payments"."refund_failed_at" is null;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_new_supplier_deliveries_check" CHECK ("platform_settings"."new_supplier_deliveries" between 1 and 1000);--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD CONSTRAINT "shipment_payments_escrow_status_check" CHECK ("shipment_payments"."escrow_status" is null or "shipment_payments"."escrow_status" in ('active','done'));--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD CONSTRAINT "shipment_payments_team_decision_check" CHECK ("shipment_payments"."team_decision" is null or "shipment_payments"."team_decision" in ('release','refund'));--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD CONSTRAINT "shipment_payments_refund_reason_check" CHECK ("shipment_payments"."refund_reason" is null or "shipment_payments"."refund_reason" in ('not_dispatched','cancelled','returned','not_delivered','team'));--> statement-breakpoint
ALTER TABLE "supplier_payment_accounts" ADD CONSTRAINT "supplier_payment_accounts_review_status_check" CHECK ("supplier_payment_accounts"."review_status" is null or "supplier_payment_accounts"."review_status" in ('pending','awaiting_approval','approved','rejected'));