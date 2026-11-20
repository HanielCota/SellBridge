-- Stripe is gone. `provider` said who created the row's links ('stripe' before Asaas, 'asaas' after);
-- on a Stripe row, customer_id/subscription_id held Stripe's cus_/sub_ ids and plan/status/period_end
-- the state Stripe reported. Such a linked account is left without a plan, as a deleted customer is.
-- An unlinked row keeps its plan. Production never charged through Stripe: only test accounts match.
UPDATE "billing_accounts" SET "customer_id" = NULL, "subscription_id" = NULL, "plan" = 'free', "status" = 'canceled', "period_end" = NULL, "cancel_at_period_end" = false, "payment_method" = NULL, "scheduled_plan" = NULL, "scheduled_plan_at" = NULL, "pending_plan" = NULL, "pending_reference" = NULL, "prepaid_until" = NULL WHERE "provider" = 'stripe' AND ("customer_id" IS NOT NULL OR "subscription_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "billing_accounts" DROP CONSTRAINT "billing_accounts_provider_check";--> statement-breakpoint
ALTER TABLE "billing_accounts" DROP COLUMN "provider";