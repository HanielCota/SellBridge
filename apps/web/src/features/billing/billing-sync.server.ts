import {
  applyBillingState,
  findBillingAccountByPendingReference,
  findBillingAccountBySubscription,
  getBillingAccount,
  type BillingAccountPatch,
} from "@sellbridge/database/repositories";
import {
  isAsaasError,
  isPaidCharge,
  paidOn,
  subscriptionBillingState,
  type AsaasBillingClient,
  type AsaasSubscription,
  type AsaasSubscriptionCharge,
  type SubscriptionBillingState,
} from "@sellbridge/payments/asaas";
import { billingPlan, isBillingPlanId } from "@sellbridge/shared/billing";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { billingClient } from "./billing-config.server";
import { paidMonthCarriedTo } from "./paid-month";
import { CHARGE_REFERENCE, CHECKOUT_REFERENCE } from "./pending-reference";

type BillingAccount = NonNullable<Awaited<ReturnType<typeof getBillingAccount>>>;

export function planDescription(planId: string): string {
  return isBillingPlanId(planId) ? `SellBridge ${billingPlan(planId).name}` : "SellBridge";
}

/** The subscription's state as Asaas records it, with the month an earlier one paid. */
export async function readSubscriptionState(
  client: AsaasBillingClient,
  input: { subscriptionId: string; prepaidUntil: Date | null },
): Promise<{
  subscription: AsaasSubscription;
  charges: AsaasSubscriptionCharge[];
  state: SubscriptionBillingState;
}> {
  const [subscription, charges] = await Promise.all([
    client.getSubscription(input.subscriptionId),
    client.listSubscriptionCharges(input.subscriptionId),
  ]);
  const state = subscriptionBillingState({
    subscription,
    charges,
    graceDays: environment.BILLING_PAST_DUE_GRACE_DAYS,
    prepaidUntil: input.prepaidUntil,
  });
  return { subscription, charges, state };
}

/** The account's first monthly fee ever is recorded once: only it may be given back. */
function firstPaidPatch(account: BillingAccount, charges: readonly AsaasSubscriptionCharge[]) {
  if (account.firstPaidOn !== null) return {};
  const days = charges.filter(isPaidCharge).map(paidOn).toSorted();
  const [first] = days;
  return first === undefined ? {} : { firstPaidOn: first };
}

/** The account a subscription belongs to: its own, or the one whose card checkout created it. */
async function accountOf(subscription: AsaasSubscription): Promise<BillingAccount | null> {
  const bound = await findBillingAccountBySubscription(database, subscription.id);
  if (bound !== null) return bound;
  if (subscription.checkoutSession == null) return null;
  return findBillingAccountByPendingReference(
    database,
    `${CHECKOUT_REFERENCE}${subscription.checkoutSession}`,
  );
}

/**
 * A card checkout's subscription replaces the account's former one. It takes the paid month
 * over only for a plan that costs no more: a dearer one waits for its own first payment.
 */
function adoptionPatch(
  account: BillingAccount,
  subscription: AsaasSubscription,
): BillingAccountPatch {
  const plan = account.pendingPlan ?? account.plan;
  const carried = isBillingPlanId(plan)
    ? paidMonthCarriedTo(account, billingPlan(plan), new Date())
    : null;
  return {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    plan,
    paymentMethod: "credit_card",
    pendingPlan: null,
    pendingReference: null,
    prepaidUntil: carried,
    cancelAtPeriodEnd: false,
  };
}

/** Once a charge from the scheduled day is paid, the smaller plan is simply the plan. */
function scheduledPatch(account: BillingAccount, state: SubscriptionBillingState) {
  const { scheduledPlan, scheduledPlanAt } = account;
  if (scheduledPlan === null || scheduledPlanAt === null || state.paidPeriod === null) return {};
  if (state.paidPeriod.start < scheduledPlanAt) return {};
  return { plan: scheduledPlan, scheduledPlan: null, scheduledPlanAt: null };
}

function statePatch(prepaidUntil: Date | null, state: SubscriptionBillingState) {
  // Its own payment ends what an earlier subscription had paid for it.
  const paidOnItsOwn =
    prepaidUntil !== null && state.paidPeriod !== null && state.paidPeriod.end > prepaidUntil;
  return {
    status: state.status,
    periodEnd: state.periodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    ...(paidOnItsOwn ? { prepaidUntil: null } : {}),
  };
}

async function retireSubscription(client: AsaasBillingClient, subscriptionId: string) {
  try {
    await client.deleteSubscription(subscriptionId);
  } catch (error) {
    if (isAsaasError(error) && error.status === 404) {
      return;
    }

    throw error;
  }
}

/**
 * Reads a subscription back from Asaas and stores what it is worth: a notice only says which
 * one changed. A card checkout's new subscription is bound here, and the one it replaces ends.
 */
export async function syncBillingSubscription(input: {
  subscriptionId: string;
  eventId: string | null;
}): Promise<void> {
  const client = billingClient();
  // Stamped before the read: a slow answer must not outrank a read that started after it.
  const observedAt = Date.now();
  const subscription = await client.getSubscription(input.subscriptionId);
  const account = await accountOf(subscription);
  if (account === null) {
    logger.info("billing.subscription_not_ours", { eventId: input.eventId });
    return;
  }
  const adopting = account.subscriptionId !== subscription.id;
  const adoption = adopting ? adoptionPatch(account, subscription) : {};
  const prepaidUntil = adopting ? (adoption.prepaidUntil ?? null) : account.prepaidUntil;
  const { charges, state } = await readSubscriptionState(client, {
    subscriptionId: subscription.id,
    prepaidUntil,
  });
  const patch = {
    ...adoption,
    ...firstPaidPatch(account, charges),
    ...statePatch(prepaidUntil, state),
    ...scheduledPatch(account, state),
  };
  await database.transaction(async (transaction) => {
    const applied = await applyBillingState(transaction, {
      tenantId: account.tenantId,
      eventId: input.eventId,
      observedAt,
      patch,
    });

    if (applied && adopting && account.subscriptionId !== null) {
      // Roll back the event and keep the old link if Asaas refuses cancellation.
      await retireSubscription(client, account.subscriptionId);
    }
  });
}

/**
 * The upgrade difference was paid: the new plan starts now, and the subscription charges its
 * full price from the next month on.
 */
export async function syncUpgradeCharge(input: {
  chargeId: string;
  eventId: string | null;
}): Promise<void> {
  const client = billingClient();
  const observedAt = Date.now();
  const account = await findBillingAccountByPendingReference(
    database,
    `${CHARGE_REFERENCE}${input.chargeId}`,
  );
  if (account?.pendingPlan == null || !isBillingPlanId(account.pendingPlan)) return;
  const charge = await client.getCharge(input.chargeId);
  if (!isPaidCharge(charge)) return;
  const plan = billingPlan(account.pendingPlan);
  if (account.subscriptionId !== null) {
    await client.changeSubscriptionValue(account.subscriptionId, {
      valueCents: plan.priceCents,
      description: planDescription(plan.id),
    });
  }
  await database.transaction(async (transaction) =>
    applyBillingState(transaction, {
      tenantId: account.tenantId,
      eventId: input.eventId,
      observedAt,
      patch: {
        plan: plan.id,
        pendingPlan: null,
        pendingReference: null,
        scheduledPlan: null,
        scheduledPlanAt: null,
      },
    }),
  );
}
