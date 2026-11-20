import {
  getBillingAccount,
  requireBillingOwner,
  saveBillingAccount,
} from "@sellbridge/database/repositories";
import {
  asaasDueDate,
  centsFromAsaasValue,
  isAsaasError,
  isPaidCharge,
  paidOn,
  refundableFirstFee,
  type AsaasBillingClient,
  type AsaasSubscriptionCharge,
} from "@sellbridge/payments/asaas";
import { AppError, conflictError } from "@sellbridge/shared/errors";
import { database } from "@/lib/server/database";
import { billingClient } from "./billing-config.server";
import { retireUnpaid, UNREACHABLE_MESSAGE, withBillingLock } from "./billing-lock.server";
import { readSubscriptionState } from "./billing-sync.server";

type BillingAccount = NonNullable<Awaited<ReturnType<typeof getBillingAccount>>>;

const REFUND_DESCRIPTION = "Cancelamento em até 7 dias da primeira mensalidade";

async function cancellableAccount(tenantId: string) {
  const account = await getBillingAccount(database, tenantId);
  if (account?.subscriptionId == null || account.cancelAtPeriodEnd) {
    throw conflictError("Você não tem uma assinatura ativa para cancelar.");
  }
  return { ...account, subscriptionId: account.subscriptionId };
}

/**
 * The account's first monthly fee, when the plan is cancelled within 7 days of paying it. A
 * subscription that took over a month already paid never counts as the first.
 */
async function refundOnCancel(
  client: AsaasBillingClient,
  account: BillingAccount & { subscriptionId: string },
): Promise<AsaasSubscriptionCharge | null> {
  if (account.prepaidUntil !== null) return null;
  const { charges } = await readSubscriptionState(client, {
    subscriptionId: account.subscriptionId,
    prepaidUntil: null,
  });
  // Before the first notice stored it, the first fee is this subscription's only paid one.
  const firstPaid = charges.filter(isPaidCharge).map(paidOn).toSorted()[0] ?? null;
  return refundableFirstFee({
    charges,
    firstPaidOn: account.firstPaidOn ?? firstPaid,
    today: asaasDueDate(new Date(), 0),
  });
}

/** What cancelling does before the reseller confirms: until when the plan lasts, or the refund. */
export async function quoteCancellation(input: { tenantId: string; userId: string }) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  const client = billingClient();
  const account = await cancellableAccount(input.tenantId);
  try {
    const refund = await refundOnCancel(client, account);
    return {
      endsAt: account.periodEnd?.toISOString() ?? null,
      refundCents: refund === null ? null : centsFromAsaasValue(refund.value),
    };
  } catch (error) {
    if (!isAsaasError(error)) throw error;
    throw new AppError("EXTERNAL_PROVIDER", UNREACHABLE_MESSAGE, { cause: error });
  }
}

/**
 * Ends the subscription: nothing renews and the paid month runs out, with no proportional
 * refund. The first monthly fee cancelled within 7 days is given back in full and the plan ends
 * now. Upgrade differences are never given back.
 */
export async function cancelSubscription(input: { tenantId: string; userId: string }) {
  await requireBillingOwner(database, input.tenantId, input.userId);
  const client = billingClient();
  return withBillingLock(input.tenantId, async () => {
    const account = await cancellableAccount(input.tenantId);
    const refund = await refundOnCancel(client, account);
    await retireUnpaid(client, { ...account, subscriptionId: null });
    // Given back before the subscription ends: a failure leaves it running, never unpaid.
    if (refund !== null) await client.refundCharge(refund.id, REFUND_DESCRIPTION);
    await client.deleteSubscription(account.subscriptionId);
    const endsNow = refund !== null || account.status === "incomplete";
    await saveBillingAccount(database, input.tenantId, {
      cancelAtPeriodEnd: true,
      scheduledPlan: null,
      scheduledPlanAt: null,
      pendingPlan: null,
      pendingReference: null,
      ...(endsNow
        ? { status: "canceled", periodEnd: refund === null ? account.periodEnd : new Date() }
        : {}),
    });
    return {
      endsAt: endsNow ? null : (account.periodEnd?.toISOString() ?? null),
      refundCents: refund === null ? null : centsFromAsaasValue(refund.value),
    };
  });
}
