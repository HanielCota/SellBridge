CREATE TABLE "shipment_payment_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_payment_id" uuid NOT NULL,
	"preference_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "refund_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "refund_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "refund_error" text;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD COLUMN "refund_held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_payment_checkouts" ADD CONSTRAINT "shipment_payment_checkouts_shipment_payment_id_shipment_payments_id_fk" FOREIGN KEY ("shipment_payment_id") REFERENCES "public"."shipment_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_payment_checkouts_preference_idx" ON "shipment_payment_checkouts" USING btree ("preference_id");--> statement-breakpoint
CREATE INDEX "shipment_payment_checkouts_payment_idx" ON "shipment_payment_checkouts" USING btree ("shipment_payment_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_payments_reconcile_idx" ON "shipment_payments" USING btree ("checked_at" NULLS FIRST) WHERE "shipment_payments"."status" in ('pending','in_process','rejected','cancelled');--> statement-breakpoint
CREATE INDEX "shipment_payments_refund_idx" ON "shipment_payments" USING btree ("paid_at") WHERE "shipment_payments"."status" = 'approved' and "shipment_payments"."refund_failed_at" is null and "shipment_payments"."refund_held_at" is null;--> statement-breakpoint
ALTER TABLE "shipment_payments" ADD CONSTRAINT "shipment_payments_refund_reason_check" CHECK ("shipment_payments"."refund_reason" is null or "shipment_payments"."refund_reason" in ('not_dispatched','cancelled','returned'));--> statement-breakpoint
-- Checkouts opened before this migration keep their record, so a late payment through them is still recognized.
INSERT INTO "shipment_payment_checkouts" ("shipment_payment_id", "preference_id", "amount_cents", "platform_fee_cents", "created_at")
SELECT "id", "preference_id", "amount_cents", "platform_fee_cents", "updated_at"
FROM "shipment_payments"
WHERE "preference_id" IS NOT NULL
ON CONFLICT ("preference_id") DO NOTHING;
