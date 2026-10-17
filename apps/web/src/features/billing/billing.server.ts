import { randomBytes } from "node:crypto";
import { BILLING_PLANS, billingNotice, effectiveBillingPlan } from "@sellbridge/shared/billing";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import {
  billingUsage,
  getBillingAccount,
  requireBillingOwner,
  saveBillingCustomer,
  tryLockBillingCheckout,
} from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import type { BillingNoticeView } from "./billing-notice";
import { availablePlans, billingConfigured, priceId, stripeClient } from "./stripe.server";

export async function billingSummary(tenantId: string, userId: string) {
  const [account, usage, prices, notice] = await Promise.all([
    getBillingAccount(database, tenantId),
    billingUsage(database, tenantId),
    availablePlans(),
    findBillingNotice(tenantId),
  ]);
  let canManage = false;
  try {
    await requireBillingOwner(database, tenantId, userId);
    canManage = true;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "FORBIDDEN") throw error;
  }
  return {
    account,
    usage,
    plans: BILLING_PLANS,
    prices,
    canManage,
    notice,
    enabled: billingConfigured(),
    effectivePlan: effectiveBillingPlan(account),
  };
}

export async function findBillingNotice(tenantId: string): Promise<BillingNoticeView | null> {
  const notice = billingNotice(await getBillingAccount(database, tenantId));
  if (notice === null) return null;
  if (notice.kind === "payment_failed") return notice;
  return { kind: "past_due", accessUntil: notice.accessUntil.toISOString() };
}

/** Stripe's answer bounds every billing call (item 16.a): the client default waits up to ~45 s. */
const STRIPE_CHECKOUT_LIMITS = { timeout: 5_000, maxNetworkRetries: 1 } as const;

async function portal(customerId: string) {
  return stripeClient().billingPortal.sessions.create(
    {
      customer: customerId,
      ...(environment.STRIPE_PORTAL_CONFIGURATION_ID
        ? { configuration: environment.STRIPE_PORTAL_CONFIGURATION_ID }
        : {}),
      return_url: new URL("/assinatura", environment.APP_URL).toString(),
    },
    STRIPE_CHECKOUT_LIMITS,
  );
}

export async function openBillingPortal(tenantId: string, userId: string) {
  await requireBillingOwner(database, tenantId, userId);
  const account = await getBillingAccount(database, tenantId);
  if (!account?.customerId) throw validationError("Sua conta ainda não possui cobranças");
  const session = await portal(account.customerId);
  return { url: session.url };
}

type StripeClient = ReturnType<typeof stripeClient>;

/** The tenant's Stripe customer; the idempotency key keeps concurrent first calls on one. */
async function ensureBillingCustomer(stripe: StripeClient, tenantId: string) {
  const account = await getBillingAccount(database, tenantId);
  if (account?.customerId) return account.customerId;
  const customer = await stripe.customers.create(
    { metadata: { tenantId } },
    { idempotencyKey: `billing-customer-${tenantId}`, ...STRIPE_CHECKOUT_LIMITS },
  );
  await saveBillingCustomer(database, tenantId, customer.id);
  return customer.id;
}

async function hasLiveSubscription(stripe: StripeClient, customerId: string) {
  const subscriptions = await stripe.subscriptions.list(
    { customer: customerId, status: "all", limit: 100 },
    STRIPE_CHECKOUT_LIMITS,
  );
  return subscriptions.data.some(
    (subscription) => !["canceled", "incomplete_expired"].includes(subscription.status),
  );
}

async function openCheckout(
  stripe: StripeClient,
  input: { tenantId: string; customerId: string; plan: "pro" | "business" },
) {
  const sessions = await stripe.checkout.sessions.list(
    { customer: input.customerId, status: "open", limit: 100 },
    STRIPE_CHECKOUT_LIMITS,
  );
  await Promise.all(
    sessions.data.map(async (session) =>
      stripe.checkout.sessions.expire(session.id, {}, STRIPE_CHECKOUT_LIMITS),
    ),
  );
  const checkout = await stripe.checkout.sessions.create(
    {
      integration_identifier: `sellbridge_${Array.from(randomBytes(8), (value) => String.fromCharCode(97 + (value % 26))).join("")}`,
      mode: "subscription",
      customer: input.customerId,
      client_reference_id: input.tenantId,
      line_items: [{ price: priceId(input.plan), quantity: 1 }],
      subscription_data: { metadata: { tenantId: input.tenantId } },
      success_url: new URL("/assinatura?retorno=sucesso", environment.APP_URL).toString(),
      cancel_url: new URL("/assinatura?retorno=cancelado", environment.APP_URL).toString(),
    },
    STRIPE_CHECKOUT_LIMITS,
  );
  if (!checkout.url) throw validationError("Não foi possível iniciar o pagamento");
  return { url: checkout.url };
}

export async function startSubscription(input: {
  tenantId: string;
  userId: string;
  plan: "pro" | "business";
}) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  await availablePlans();
  const stripe = stripeClient();
  const customerId = await ensureBillingCustomer(stripe, input.tenantId);
  // The advisory lock keeps two clicks from opening two checkouts (and two subscriptions); it
  // holds no row, so the tenant's publications and store connections never wait on Stripe.
  return database.transaction(async (transaction) => {
    if (!(await tryLockBillingCheckout(transaction, input.tenantId))) {
      throw conflictError("Já estamos abrindo o pagamento. Aguarde alguns segundos.");
    }
    if (await hasLiveSubscription(stripe, customerId)) {
      const session = await portal(customerId);
      return { url: session.url };
    }
    return openCheckout(stripe, { tenantId: input.tenantId, customerId, plan: input.plan });
  });
}
