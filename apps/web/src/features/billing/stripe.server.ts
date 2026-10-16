import { Stripe } from "stripe";
import {
  type BillingPlan,
  type BillingPlanId,
  type PaidPlanId,
  paidPlanIds,
  planCatalog,
} from "@sellbridge/shared/billing";
import { validationError } from "@sellbridge/shared/errors";
import { environment } from "@/lib/server/environment";

/** The plans in force: the PDF's matrix with PLAN_MATRIX_ENABLED (item 31.a), else today's. */
export function activePlans(): readonly BillingPlan[] {
  return planCatalog(environment.PLAN_MATRIX_ENABLED);
}

/** What the repositories need to apply the plan limits; spread into their inputs. */
export function billingOptions(): { billingEnabled: boolean; planMatrix: boolean } {
  return { billingEnabled: billingConfigured(), planMatrix: environment.PLAN_MATRIX_ENABLED };
}

function configuredPriceIds(): Record<PaidPlanId, string | undefined> {
  return {
    start: environment.STRIPE_START_PRICE_ID,
    pro: environment.STRIPE_PRO_PRICE_ID,
    business: environment.STRIPE_BUSINESS_PRICE_ID,
    black: environment.STRIPE_BLACK_PRICE_ID,
    elite: environment.STRIPE_ELITE_PRICE_ID,
  };
}

export function billingConfigured() {
  const prices = configuredPriceIds();
  return Boolean(
    environment.STRIPE_SECRET_KEY &&
    environment.STRIPE_WEBHOOK_SECRET &&
    paidPlanIds(environment.PLAN_MATRIX_ENABLED).every((plan) => prices[plan]),
  );
}

export function stripeClient() {
  if (!billingConfigured() || !environment.STRIPE_SECRET_KEY) {
    throw validationError("A cobrança ainda não foi configurada");
  }
  return new Stripe(environment.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15000 });
}

/** The Stripe price of a plan sold today; refuses a plan outside the catalog in force. */
export function priceId(plan: PaidPlanId) {
  const sold = paidPlanIds(environment.PLAN_MATRIX_ENABLED).includes(plan);
  const price = configuredPriceIds()[plan];
  if (!sold || !price) throw validationError("Plano indisponível");
  return price;
}

/** The plan a Stripe price pays for; "free" for a price the catalog in force does not sell. */
export function planOfPrice(price: string | undefined): BillingPlanId {
  const prices = configuredPriceIds();
  const plan = paidPlanIds(environment.PLAN_MATRIX_ENABLED).find(
    (candidate) => price !== undefined && prices[candidate] === price,
  );
  return plan ?? "free";
}

export async function availablePlans() {
  if (!billingConfigured()) return [];
  const stripe = stripeClient();
  return Promise.all(
    paidPlanIds(environment.PLAN_MATRIX_ENABLED).map(async (id) => {
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
