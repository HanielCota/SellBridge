import { Stripe } from "stripe";
import { BILLING_PLAN_IDS, type BillingPlanId } from "@sellbridge/shared/billing";
import { validationError } from "@sellbridge/shared/errors";
import { environment } from "@/lib/server/environment";

function priceIds(): Record<BillingPlanId, string | undefined> {
  return {
    start: environment.STRIPE_START_PRICE_ID,
    pro: environment.STRIPE_PRO_PRICE_ID,
    business: environment.STRIPE_BUSINESS_PRICE_ID,
    black: environment.STRIPE_BLACK_PRICE_ID,
    elite: environment.STRIPE_ELITE_PRICE_ID,
  };
}

export function billingConfigured() {
  return (
    environment.STRIPE_SECRET_KEY !== undefined && environment.STRIPE_WEBHOOK_SECRET !== undefined
  );
}

export function stripeClient() {
  if (environment.STRIPE_SECRET_KEY === undefined) {
    throw validationError("A cobrança ainda não foi configurada");
  }
  return new Stripe(environment.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15000 });
}

/** The plan a Stripe price sells, or "none" for a price this application does not sell. */
export function planOfPrice(price: string | undefined): BillingPlanId | "none" {
  if (price === undefined) return "none";
  const prices = priceIds();
  return BILLING_PLAN_IDS.find((plan) => prices[plan] === price) ?? "none";
}
