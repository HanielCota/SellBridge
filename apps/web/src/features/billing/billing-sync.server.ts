import {
  applyBillingState,
  findBillingAccountByPendingReference,
  findBillingAccountBySubscription,
  getBillingAccount,
  settlePendingReference,
  type BillingAccountPatch,
} from "@sellbridge/database/repositories";
import {
  asaasDueDate,
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
import { upgradeUntil } from "./upgrade-reference";

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
  // A renewal ends the month an open upgrade difference was worked out for.
  if (!adopting) await retireLapsedDifference(client, account, new Date());
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

const LATE_DIFFERENCE_REFUND = "Diferença de plano paga depois do fim do mês a que se referia";

/** The day the difference counts as paid: a card is confirmed long before its money lands. */
function differencePaidOn(charge: AsaasSubscriptionCharge): string {
  const days = [charge.confirmedDate, charge.paymentDate].filter(
    (day): day is string => day != null,
  );
  return days.toSorted()[0] ?? charge.dueDate;
}

/** Paid on or after the day the month it was worked out for ended: it covers nothing. */
function paidTooLate(charge: AsaasSubscriptionCharge): boolean {
  const until = upgradeUntil(charge.externalReference);
  return until !== null && differencePaidOn(charge) >= asaasDueDate(until, 0);
}

function isOpenCharge(charge: AsaasSubscriptionCharge): boolean {
  return (charge.status === "PENDING" || charge.status === "OVERDUE") && charge.deleted !== true;
}

async function readChargeUnlessGone(
  client: AsaasBillingClient,
  chargeId: string,
): Promise<AsaasSubscriptionCharge | null> {
  try {
    return await client.getCharge(chargeId);
  } catch (error) {
    if (isAsaasError(error) && error.status === 404) return null;
    throw error;
  }
}

/** Paid only after its month ended: the money goes back and the plan stays where it was. */
async function giveBackLateDifference(
  client: AsaasBillingClient,
  input: { tenantId: string; reference: string; charge: AsaasSubscriptionCharge },
): Promise<void> {
  await client.refundCharge(input.charge.id, LATE_DIFFERENCE_REFUND);
  await settlePendingReference(database, { tenantId: input.tenantId, reference: input.reference });
  logger.warn("billing.late_difference_refunded", {});
}

/**
 * Ends an upgrade difference whose month is over, so it can never move the plan up for a month
 * already gone: an unpaid one is deleted, one paid too late is given back, one already given
 * back is just forgotten. A difference paid in time is left for its own sync. True when the
 * account no longer waits on it.
 */
export async function retireLapsedDifference(
  client: AsaasBillingClient,
  account: { tenantId: string; pendingReference: string | null },
  now: Date,
): Promise<boolean> {
  const reference = account.pendingReference;
  if (reference?.startsWith(CHARGE_REFERENCE) !== true) return false;
  const charge = await readChargeUnlessGone(client, reference.slice(CHARGE_REFERENCE.length));
  if (charge !== null) {
    const until = upgradeUntil(charge.externalReference);
    if (until === null || until > now) return false;
    if (isPaidCharge(charge) && !paidTooLate(charge)) return false;
    if (isPaidCharge(charge)) {
      await giveBackLateDifference(client, { tenantId: account.tenantId, reference, charge });
      return true;
    }
    if (isOpenCharge(charge)) await removeChargeUnlessGone(client, charge.id);
  }
  return settlePendingReference(database, { tenantId: account.tenantId, reference });
}

async function removeChargeUnlessGone(client: AsaasBillingClient, chargeId: string) {
  try {
    await client.deleteCharge(chargeId);
  } catch (error) {
    if (isAsaasError(error) && error.status === 404) return;
    throw error;
  }
}

export type UpgradeOutcome = "applied" | "given_back" | "unpaid" | "not_waiting";

/**
 * The upgrade difference was paid: the new plan starts now, and the subscription charges its
 * full price from the next month on. Paid only after its month ended, it is given back instead.
 * Settled only while the account still waits on this charge, so it applies exactly once.
 */
export async function syncUpgradeCharge(input: {
  chargeId: string;
  eventId: string | null;
}): Promise<UpgradeOutcome> {
  const client = billingClient();
  const reference = `${CHARGE_REFERENCE}${input.chargeId}`;
  const account = await findBillingAccountByPendingReference(database, reference);
  if (account?.pendingPlan == null || !isBillingPlanId(account.pendingPlan)) return "not_waiting";
  const charge = await client.getCharge(input.chargeId);
  if (!isPaidCharge(charge)) return "unpaid";
  const { tenantId } = account;
  if (paidTooLate(charge)) {
    await giveBackLateDifference(client, { tenantId, reference, charge });
    return "given_back";
  }
  const plan = billingPlan(account.pendingPlan);
  if (account.subscriptionId !== null) {
    await client.changeSubscriptionValue(account.subscriptionId, {
      valueCents: plan.priceCents,
      description: planDescription(plan.id),
    });
  }
  const patch = { plan: plan.id, scheduledPlan: null, scheduledPlanAt: null };
  await settlePendingReference(database, { tenantId, reference, patch });
  return "applied";
}
