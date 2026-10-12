import { randomBytes } from "node:crypto";
import { BILLING_PLANS, effectiveBillingPlan } from "@sellbridge/shared/billing";
import { validationError } from "@sellbridge/shared/errors";
import {
  billingUsage,
  getBillingAccount,
  lockBillingTenant,
  requireBillingOwner,
  saveBillingCustomer,
} from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { availablePlans, billingConfigured, priceId, stripeClient } from "./stripe.server";

export async function billingSummary(tenantId: string, userId: string) {
  const [account, usage, prices] = await Promise.all([
    getBillingAccount(database, tenantId),
    billingUsage(database, tenantId),
    availablePlans(),
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
    enabled: billingConfigured(),
    effectivePlan: effectiveBillingPlan(account),
  };
}

async function portal(customerId: string) {
  return stripeClient().billingPortal.sessions.create({
    customer: customerId,
    ...(environment.STRIPE_PORTAL_CONFIGURATION_ID
      ? { configuration: environment.STRIPE_PORTAL_CONFIGURATION_ID }
      : {}),
    return_url: new URL("/assinatura", environment.APP_URL).toString(),
  });
}

export async function openBillingPortal(tenantId: string, userId: string) {
  await requireBillingOwner(database, tenantId, userId);
  const account = await getBillingAccount(database, tenantId);
  if (!account?.customerId) throw validationError("Sua conta ainda não possui cobranças");
  const session = await portal(account.customerId);
  return { url: session.url };
}

export async function startSubscription(input: {
  tenantId: string;
  userId: string;
  plan: "pro" | "business";
}) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  await availablePlans();
  const stripe = stripeClient();
  return database.transaction(async (transaction) => {
    await lockBillingTenant(transaction, input.tenantId);
    const account = await getBillingAccount(transaction, input.tenantId);
    const customerId =
      account?.customerId ??
      (
        await stripe.customers.create(
          {
            metadata: { tenantId: input.tenantId },
          },
          { idempotencyKey: `billing-customer-${input.tenantId}` },
        )
      ).id;
    await saveBillingCustomer(transaction, input.tenantId, customerId);
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    if (
      subscriptions.data.some(
        (subscription) => !["canceled", "incomplete_expired"].includes(subscription.status),
      )
    ) {
      const session = await portal(customerId);
      return { url: session.url };
    }
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      status: "open",
      limit: 100,
    });
    for (const session of sessions.data) await stripe.checkout.sessions.expire(session.id);
    const checkout = await stripe.checkout.sessions.create({
      integration_identifier: `sellbridge_${Array.from(randomBytes(8), (value) => String.fromCharCode(97 + (value % 26))).join("")}`,
      mode: "subscription",
      customer: customerId,
      client_reference_id: input.tenantId,
      line_items: [{ price: priceId(input.plan), quantity: 1 }],
      subscription_data: { metadata: { tenantId: input.tenantId } },
      success_url: new URL("/assinatura?retorno=sucesso", environment.APP_URL).toString(),
      cancel_url: new URL("/assinatura?retorno=cancelado", environment.APP_URL).toString(),
    });
    if (!checkout.url) throw validationError("Não foi possível iniciar o pagamento");
    return { url: checkout.url };
  });
}
