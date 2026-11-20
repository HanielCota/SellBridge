import { randomUUID } from "node:crypto";
import {
  getBillingAccount,
  saveBillingAccount,
  tryLockBillingCheckout,
} from "@sellbridge/database/repositories";
import { isAsaasError, isPaidCharge, type AsaasBillingClient } from "@sellbridge/payments/asaas";
import { AppError, conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { billingLockDatabase } from "./billing-lock-database.server";
import { syncBillingSubscription, syncUpgradeCharge } from "./billing-sync.server";
import {
  CHARGE_REFERENCE,
  CHECKOUT_REFERENCE,
  CREATION_REFERENCE,
  SUBSCRIPTION_REFERENCE,
} from "./pending-reference";

type BillingAccount = NonNullable<Awaited<ReturnType<typeof getBillingAccount>>>;

export const UNREACHABLE_MESSAGE =
  "Não conseguimos falar com o Asaas agora. Tente de novo em alguns minutos.";

/** One subscription change per tenant at a time; it holds no row, only an advisory lock. */
export async function withBillingLock<Result>(tenantId: string, run: () => Promise<Result>) {
  try {
    return await billingLockDatabase().transaction(async (transaction) => {
      if (!(await tryLockBillingCheckout(transaction, tenantId))) {
        throw conflictError("Já estamos cuidando da sua assinatura. Aguarde alguns segundos.");
      }
      return run();
    });
  } catch (error) {
    if (!isAsaasError(error)) throw error;
    logger.warn("billing.asaas_failed", { error, status: error.status, codes: error.codes });
    throw new AppError("EXTERNAL_PROVIDER", UNREACHABLE_MESSAGE, { cause: error });
  }
}

const REJECTED_CREATION_STATUSES = new Set([400, 401, 403, 404, 422, 429]);

export function assertNoPendingBillingCreation(reference: string | null | undefined): void {
  if (reference?.startsWith(CREATION_REFERENCE) === true) {
    throw conflictError(
      "O Asaas ainda não confirmou esta operação. Fale com o suporte antes de tentar de novo.",
    );
  }
}

/** Save a reference before POST so a lost response cannot make the next request charge twice. */
export async function reserveBillingCreation<Result>(
  tenantId: string,
  previousReference: string | null,
  create: (reference: string) => Promise<Result>,
): Promise<Result> {
  assertNoPendingBillingCreation(previousReference);
  const reference = randomUUID();
  await saveBillingAccount(database, tenantId, {
    pendingReference: `${CREATION_REFERENCE}${reference}`,
  });

  try {
    return await create(reference);
  } catch (error) {
    if (
      isAsaasError(error) &&
      error.status !== null &&
      REJECTED_CREATION_STATUSES.has(error.status)
    ) {
      await saveBillingAccount(database, tenantId, { pendingReference: previousReference });
    }

    throw error;
  }
}

const PAID_MEANWHILE =
  "O seu pagamento acabou de entrar e a assinatura foi atualizada. Atualize a página e confira.";

/** Something Asaas no longer has is no longer waiting for payment. */
async function readUnlessGone<Result>(read: () => Promise<Result>): Promise<Result | null> {
  try {
    return await read();
  } catch (error) {
    if (isAsaasError(error) && error.status === 404) return null;
    throw error;
  }
}

async function removeUnlessGone(remove: () => Promise<unknown>): Promise<void> {
  await readUnlessGone(remove);
}

/**
 * An upgrade difference still open is deleted. One already paid is synced: in time, it moved
 * the plan up and the action stops so the reseller sees it; too late, it was given back and the
 * action goes on. One given back before is left alone.
 */
async function retireDifference(client: AsaasBillingClient, chargeId: string): Promise<void> {
  const charge = await readUnlessGone(async () => client.getCharge(chargeId));
  if (charge === null) return;
  if (isPaidCharge(charge)) {
    const outcome = await syncUpgradeCharge({ chargeId, eventId: null });
    if (outcome === "applied") throw conflictError(PAID_MEANWHILE);
    return;
  }
  const open =
    (charge.status === "PENDING" || charge.status === "OVERDUE") && charge.deleted !== true;
  if (open) await removeUnlessGone(async () => client.deleteCharge(chargeId));
}

/**
 * Asaas cannot be asked about a checkout, but the subscription a paid one created can be found
 * among the customer's: it is synced instead of left orphaned, charging the card every month.
 */
async function retireCheckout(
  client: AsaasBillingClient,
  account: BillingAccount,
  checkoutId: string,
): Promise<void> {
  if (account.customerId !== null) {
    const subscriptions = await client.findSubscriptionsOfCustomer(account.customerId);
    const created = subscriptions.find(
      (subscription) =>
        subscription.checkoutSession === checkoutId && subscription.deleted !== true,
    );
    if (created !== undefined) {
      await syncBillingSubscription({ subscriptionId: created.id, eventId: null });
      throw conflictError(PAID_MEANWHILE);
    }
  }
  await removeUnlessGone(async () => client.cancelCheckout(checkoutId));
}

/** A first fee Asaas already received is synced, not deleted with its subscription. */
async function retireIncompleteSubscription(
  client: AsaasBillingClient,
  subscriptionId: string,
): Promise<void> {
  const charges = await readUnlessGone(async () => client.listSubscriptionCharges(subscriptionId));
  if (charges?.some(isPaidCharge) === true) {
    await syncBillingSubscription({ subscriptionId, eventId: null });
    throw conflictError(PAID_MEANWHILE);
  }
  await removeUnlessGone(async () => client.deleteSubscription(subscriptionId));
}

/**
 * Closes what was opened and never paid, so an old link cannot start a second subscription.
 * The local status lags behind a delayed notice, so Asaas is read first: what it already has
 * as paid is synced instead of deleted.
 */
export async function retireUnpaid(
  client: AsaasBillingClient,
  account: BillingAccount,
): Promise<void> {
  const reference = account.pendingReference;
  assertNoPendingBillingCreation(reference);
  if (reference?.startsWith(CHARGE_REFERENCE) === true) {
    await retireDifference(client, reference.slice(CHARGE_REFERENCE.length));
  }
  if (reference?.startsWith(CHECKOUT_REFERENCE) === true) {
    await retireCheckout(client, account, reference.slice(CHECKOUT_REFERENCE.length));
  }
  if (reference?.startsWith(SUBSCRIPTION_REFERENCE) === true) {
    await retireIncompleteSubscription(client, reference.slice(SUBSCRIPTION_REFERENCE.length));
  }
  if (account.subscriptionId !== null && account.status === "incomplete") {
    await retireIncompleteSubscription(client, account.subscriptionId);
  }
}
