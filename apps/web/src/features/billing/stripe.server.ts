import { Stripe } from "stripe";
import { validationError } from "@sellbridge/shared/errors";
import { environment } from "@/lib/server/environment";

export function billingConfigured() {
  return Boolean(
    environment.STRIPE_SECRET_KEY &&
    environment.STRIPE_WEBHOOK_SECRET &&
    environment.STRIPE_PRO_PRICE_ID &&
    environment.STRIPE_BUSINESS_PRICE_ID,
  );
}

export function stripeClient() {
  if (!billingConfigured() || !environment.STRIPE_SECRET_KEY) {
    throw validationError("A cobrança ainda não foi configurada");
  }
  return new Stripe(environment.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15000 });
}

export function priceId(plan: "pro" | "business") {
  const price =
    plan === "pro" ? environment.STRIPE_PRO_PRICE_ID : environment.STRIPE_BUSINESS_PRICE_ID;
  if (!price) throw validationError("Plano indisponível");
  return price;
}

export async function availablePlans() {
  if (!billingConfigured()) return [];
  const stripe = stripeClient();
  return Promise.all(
    (["pro", "business"] as const).map(async (id) => {
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
