import { applyBillingEvent, findBillingCustomer } from "@sellbridge/database/repositories";
import { readTextWithin } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { billingConfigured, stripeClient } from "./stripe.server";

const subscriptionSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  cancel_at: z.number().nullable().optional(),
  ended_at: z.number().nullable().optional(),
  pause_collection: z.unknown().nullish(),
  items: z.object({
    data: z
      .array(z.object({ current_period_end: z.number(), price: z.object({ id: z.string() }) }))
      .min(1),
  }),
});

export async function handleBillingWebhook(request: Request) {
  if (!billingConfigured() || !environment.STRIPE_WEBHOOK_SECRET)
    return new Response("Billing unavailable", { status: 503 });
  const body = await readTextWithin(request, 1048576);
  if (body === null) return new Response("Payload too large", { status: 413 });
  const stripe = stripeClient();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      request.headers.get("stripe-signature") ?? "",
      environment.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (
    !event.type.startsWith("customer.subscription.") &&
    ![
      "invoice.paid",
      "invoice.payment_failed",
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  )
    return Response.json({ received: true });
  try {
    const object = billingEventReference(event.type, event.data.object);
    if (!object) return Response.json({ received: true });
    // Fetch current state: delayed or reordered deliveries cannot restore an old plan.
    await synchronizeBillingEvent({ eventId: event.id, object });
    return Response.json({ received: true });
  } catch (error) {
    logger.error("billing.webhook_failed", { eventId: event.id, error });
    return new Response("Retry later", { status: 500 });
  }
}

function billingEventReference(type: string, value: unknown) {
  if (type.startsWith("customer.subscription."))
    return z.object({ id: z.string(), customer: z.string() }).parse(value);
  if (type.startsWith("checkout.session.")) {
    const checkout = z
      .object({
        subscription: z.string().nullable(),
        customer: z.string().nullable(),
        payment_status: z.string(),
      })
      .parse(value);
    if (checkout.payment_status !== "paid" || !checkout.subscription || !checkout.customer)
      return null;
    return { id: checkout.subscription, customer: checkout.customer };
  }
  const invoice = z
    .object({
      customer: z.string(),
      parent: z
        .object({
          subscription_details: z.object({ subscription: z.string() }).nullable().optional(),
        })
        .nullable(),
    })
    .parse(value);
  return invoice.parent?.subscription_details
    ? { id: invoice.parent.subscription_details.subscription, customer: invoice.customer }
    : null;
}

/**
 * Stripe is read before the transaction opens (item 16.a, N5), so no row or pooled connection
 * waits on the provider. Two deliveries can then race; the account keeps the state read last
 * (`observedAt`), which is at least as new as every event already delivered. A timeout fails the
 * webhook, which Stripe sends again.
 */
const STRIPE_WEBHOOK_LIMITS = { timeout: 5_000, maxNetworkRetries: 1 } as const;

async function currentSubscription(object: { id: string; customer: string }) {
  const stripe = stripeClient();
  const subscriptions = await stripe.subscriptions.list(
    { customer: object.customer, status: "all", limit: 100 },
    STRIPE_WEBHOOK_LIMITS,
  );
  const current = subscriptions.data.find(
    (candidate) => !["canceled", "incomplete_expired"].includes(candidate.status),
  );
  return subscriptionSchema.parse(
    current ?? (await stripe.subscriptions.retrieve(object.id, {}, STRIPE_WEBHOOK_LIMITS)),
  );
}

function planOfPrice(priceId: string | undefined) {
  if (priceId === environment.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === environment.STRIPE_BUSINESS_PRICE_ID) return "business";
  return "free";
}

function billingStateOf(subscription: z.infer<typeof subscriptionSchema>) {
  const item = subscription.items.data[0];
  return {
    customerId: subscription.customer,
    subscriptionId: subscription.id,
    plan: planOfPrice(item?.price.id),
    status: subscription.pause_collection ? "paused" : subscription.status,
    periodEnd: item
      ? new Date(
          Math.min(
            item.current_period_end,
            subscription.cancel_at ?? item.current_period_end,
            subscription.ended_at ?? item.current_period_end,
          ) * 1000,
        )
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at != null,
  };
}

async function synchronizeBillingEvent(input: {
  eventId: string;
  object: { id: string; customer: string };
}) {
  const account = await findBillingCustomer(database, input.object.customer);
  if (!account) return;
  const subscription = await currentSubscription(input.object);
  const observedAt = Date.now();
  await database.transaction(async (transaction) => {
    await applyBillingEvent(transaction, {
      eventId: input.eventId,
      observedAt,
      ...billingStateOf(subscription),
    });
  });
}
