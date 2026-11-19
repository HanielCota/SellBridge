CREATE TABLE "return_claim_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"side" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_claim_photos_side_check" CHECK ("return_claim_photos"."side" in ('seller','supplier')),
	CONSTRAINT "return_claim_photos_size_check" CHECK ("return_claim_photos"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "policy_step" text;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "destination" text;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "reason_note" text;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "return_shipping_cents" integer;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "reason_stated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "forward_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "forwarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "forward_tracking_code" text;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "supplier_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "marketplace_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "supplier_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "supplier_verdict" text;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "supplier_condition" text;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "supplier_resellable" boolean;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "supplier_answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "close_reason" text;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "supplier_owes_shipping_cents" integer;--> statement-breakpoint
ALTER TABLE "return_claims" ADD COLUMN "stock_returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "return_answer_business_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "return_claim_photos" ADD CONSTRAINT "return_claim_photos_claim_id_return_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."return_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_claim_photos_claim_idx" ON "return_claim_photos" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "return_claims_policy_step_idx" ON "return_claims" USING btree ("policy_step");--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_policy_step_check" CHECK ("return_claims"."policy_step" is null or "return_claims"."policy_step" in ('awaiting_supplier','awaiting_forward','forwarded','disputed','closed'));--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_destination_check" CHECK ("return_claims"."destination" is null or "return_claims"."destination" in ('supplier','seller'));--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_reason_check" CHECK ("return_claims"."reason" is null or "return_claims"."reason" in ('defect','damaged','wrong_item','regret','not_delivered'));--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_verdict_check" CHECK ("return_claims"."supplier_verdict" is null or "return_claims"."supplier_verdict" in ('as_described','not_as_described','not_received'));--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_close_reason_check" CHECK ("return_claims"."close_reason" is null or "return_claims"."close_reason" in ('supplier_agreed','supplier_silent','team_decided','not_forwarded'));--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_shipping_check" CHECK (("return_claims"."return_shipping_cents" is null or "return_claims"."return_shipping_cents" >= 0) and ("return_claims"."supplier_owes_shipping_cents" is null or "return_claims"."supplier_owes_shipping_cents" >= 0));--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_return_answer_days_check" CHECK ("platform_settings"."return_answer_business_days" between 1 and 5);