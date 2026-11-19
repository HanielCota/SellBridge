import { randomBytes } from "node:crypto";
import {
  BILLING_PLANS,
  billingLimits,
  billingNotice,
  type BillingPlanId,
} from "@sellbridge/shared/billing";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import {
  billingUsage,
  findBillingAccess,
  findBillingTenantCreatedAt,
  getBillingAccount,
  getPaymentFeeSetting,
  requireBillingOwner,
  saveBillingCustomer,
  tryLockBillingCheckout,
} from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import type { BillingNoticeView } from "./billing-notice";
import type { NewStoreBlock } from "./new-store-block";
import { availablePlans, billingRules, priceId, stripeClient } from "./stripe.server";

/** The access as the page shows it: dates as ISO strings, limits null while unlimited. */
async function accessView(tenantId: string) {
  const rules = billingRules();
  if (rules === null) return { kind: "unlimited" as const, limits: null };
  const access = await findBillingAccess(database, tenantId, rules);
  const limits = billingLimits(access);
  if (access.kind === "plan") return { kind: "plan" as const, planId: access.plan.id, limits };
  if (access.kind === "transition") {
    return { kind: "transition" as const, until: access.until.toISOString(), limits };
  }
  return { kind: "none" as const, limits };
}

export async function billingSummary(tenantId: string, userId: string) {
  const [account, usage, prices, notice, access, fee] = await Promise.all([
    getBillingAccount(database, tenantId),
    billingUsage(database, tenantId),
    availablePlans(),
    findBillingNotice(tenantId),
    accessView(tenantId),
    getPaymentFeeSetting(database),
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
    access,
    enabled: access.kind !== "unlimited",
    platformFeeBasisPoints: fee.basisPoints,
  };
}

export async function findBillingNotice(tenantId: string): Promise<BillingNoticeView | null> {
  const rules = billingRules();
  if (rules === null) return null;
  const [account, tenantCreatedAt] = await Promise.all([
    getBillingAccount(database, tenantId),
    findBillingTenantCreatedAt(database, tenantId),
  ]);
  const notice = billingNotice({
    subscription: account,
    tenantCreatedAt,
    transition: rules.transition,
  });
  if (notice === null) return null;
  if (notice.kind === "past_due") {
    return { kind: "past_due", accessUntil: notice.accessUntil.toISOString() };
  }
  if (notice.kind === "transition") {
    return { kind: "transition", until: notice.until.toISOString(), endingSoon: notice.endingSoon };
  }
  return notice;
}

/** Stripe's answer bounds every billing call (item 16.a): the client default waits up to ~45 s. */
const STRIPE_CHECKOUT_LIMITS = { timeout: 5_000, maxNetworkRetries: 1 } as const;
/** Without it Stripe follows the browser's language, and the payment page may open in English. */
const STRIPE_LOCALE = "pt-BR";

/** A plan change the portal confirms: the reseller sees the new price before agreeing. */
interface PlanChange {
  subscriptionId: string;
  itemId: string;
  priceId: string;
}

async function portal(customerId: string, change: PlanChange | null = null) {
  const returnUrl = new URL("/assinatura", environment.APP_URL).toString();
  return stripeClient().billingPortal.sessions.create(
    {
      customer: customerId,
      locale: STRIPE_LOCALE,
      ...(environment.STRIPE_PORTAL_CONFIGURATION_ID
        ? { configuration: environment.STRIPE_PORTAL_CONFIGURATION_ID }
        : {}),
      return_url: returnUrl,
      ...(change === null
        ? {}
        : {
            flow_data: {
              type: "subscription_update_confirm" as const,
              subscription_update_confirm: {
                subscription: change.subscriptionId,
                items: [{ id: change.itemId, price: change.priceId, quantity: 1 }],
              },
              after_completion: {
                type: "redirect" as const,
                redirect: { return_url: `${returnUrl}?retorno=troca` },
              },
            },
          }),
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

async function findLiveSubscription(stripe: StripeClient, customerId: string) {
  const subscriptions = await stripe.subscriptions.list(
    { customer: customerId, status: "all", limit: 100 },
    STRIPE_CHECKOUT_LIMITS,
  );
  return (
    subscriptions.data.find(
      (subscription) => !["canceled", "incomplete_expired"].includes(subscription.status),
    ) ?? null
  );
}

type LiveSubscription = NonNullable<Awaited<ReturnType<typeof findLiveSubscription>>>;

/**
 * Switching an active subscription to another plan goes through the portal's confirmation;
 * anything else (same plan, a payment to fix) opens the portal itself.
 */
function planChangeOf(subscription: LiveSubscription, plan: BillingPlanId): PlanChange | null {
  if (!["active", "trialing"].includes(subscription.status)) return null;
  const item = subscription.items.data[0];
  if (item === undefined) return null;
  const target = priceId(plan);
  if (item.price.id === target) return null;
  return { subscriptionId: subscription.id, itemId: item.id, priceId: target };
}

async function openCheckout(
  stripe: StripeClient,
  input: { tenantId: string; customerId: string; plan: BillingPlanId },
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
      locale: STRIPE_LOCALE,
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

/** Opens the checkout of a first subscription, or the portal to change or fix an existing one. */
export async function startSubscription(input: {
  tenantId: string;
  userId: string;
  plan: BillingPlanId;
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
    const live = await findLiveSubscription(stripe, customerId);
    if (live !== null) {
      const session = await portal(customerId, planChangeOf(live, input.plan));
      return { url: session.url };
    }
    return openCheckout(stripe, { tenantId: input.tenantId, customerId, plan: input.plan });
  });
}

/** Why a new store cannot be connected now, or null when it fits (or billing is off). */
export async function findNewStoreBlock(tenantId: string): Promise<NewStoreBlock | null> {
  const rules = billingRules();
  if (rules === null) return null;
  const [access, usage] = await Promise.all([
    findBillingAccess(database, tenantId, rules),
    billingUsage(database, tenantId),
  ]);
  const limits = billingLimits(access);
  if (limits === null || usage.stores < limits.stores) return null;
  if (access.kind === "plan") return { kind: "plan_full", planName: access.plan.name };
  return { kind: "choose_plan" };
}

/** Whether the tenant's plan answers its tickets first (Elite). */
export async function hasPrioritySupport(tenantId: string): Promise<boolean> {
  const rules = billingRules();
  if (rules === null) return false;
  const access = await findBillingAccess(database, tenantId, rules);
  return access.kind === "plan" && access.plan.prioritySupport;
}
