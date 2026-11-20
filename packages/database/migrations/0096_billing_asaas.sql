ALTER TABLE "billing_accounts" ADD COLUMN "provider" text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "scheduled_plan" text;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "scheduled_plan_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "pending_plan" text;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "pending_reference" text;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "prepaid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "first_paid_on" date;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_provider_check" CHECK ("billing_accounts"."provider" in ('stripe', 'asaas'));--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_payment_method_check" CHECK ("billing_accounts"."payment_method" is null or "billing_accounts"."payment_method" in ('pix', 'credit_card'));--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_scheduled_plan_check" CHECK (("billing_accounts"."scheduled_plan" is null) = ("billing_accounts"."scheduled_plan_at" is null));