import { Stripe } from "stripe";
import {
  BILLING_PLAN_IDS,
  type BillingPlanId,
  type BillingRules,
  type BillingTransition,
} from "@sellbridge/shared/billing";
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
  const prices = priceIds();
  return (
    environment.STRIPE_SECRET_KEY !== undefined &&
    environment.STRIPE_WEBHOOK_SECRET !== undefined &&
    BILLING_PLAN_IDS.every((plan) => prices[plan] !== undefined)
  );
}

function billingTransition(): BillingTransition | null {
  const { BILLING_LAUNCHED_AT: launchedAt, BILLING_TRANSITION_ENDS_AT: endsAt } = environment;
  if (launchedAt === undefined || endsAt === undefined) return null;
  return { launchedAt: new Date(launchedAt), endsAt: new Date(endsAt) };
}

/** The plan limits to enforce, or null while billing is not configured (no limits at all). */
export function billingRules(): BillingRules | null {
  if (!billingConfigured()) return null;
  return { transition: billingTransition() };
}

export function stripeClient() {
  if (!billingConfigured() || environment.STRIPE_SECRET_KEY === undefined) {
    throw validationError("A cobrança ainda não foi configurada");
  }
  return new Stripe(environment.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15000 });
}

export function priceId(plan: BillingPlanId) {
  const price = priceIds()[plan];
  if (price === undefined) throw validationError("Plano indisponível");
  return price;
}

/** The plan a Stripe price sells, or "none" for a price this application does not sell. */
export function planOfPrice(price: string | undefined): BillingPlanId | "none" {
  if (price === undefined) return "none";
  const prices = priceIds();
  return BILLING_PLAN_IDS.find((plan) => prices[plan] === price) ?? "none";
}

export async function availablePlans() {
  if (!billingConfigured()) return [];
  const stripe = stripeClient();
  return Promise.all(
    BILLING_PLAN_IDS.map(async (id) => {
      const price = await stripe.prices.retrieve(priceId(id));
      if (
        !price.active ||
        price.currency !== "brl" ||
        price.recurring?.interval !== "month" ||
        price.recurring.interval_count !== 1 ||
        price.unit_amount === null ||
        price.type !== "recurring"
      ) {
        throw validationError("Configure preços mensais fixos em BRL para os planos");
      }
      return { id, priceCents: price.unit_amount };
    }),
  );
}
