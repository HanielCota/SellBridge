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
import {
  isGivenBackCharge,
  isOpenCharge,
  syncBillingSubscription,
  syncUpgradeCharge,
} from "./billing-sync.server";
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

export function assertAsaasBillingAccount(
  account: Pick<BillingAccount, "provider" | "customerId" | "subscriptionId"> | null,
): void {
  if (
    account?.provider === "stripe" &&
    (account.customerId !== null || account.subscriptionId !== null)
  ) {
    throw conflictError(
      "Esta conta ainda tem um vínculo de cobrança com o Stripe. Fale com o suporte para concluir a troca.",
    );
  }
}

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
    provider: "asaas",
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

const CHANGED_MEANWHILE =
  "A diferença de plano acabou de mudar no Asaas. Atualize a página e tente de novo.";
const STILL_IN_REVIEW =
  "O pagamento da diferença de plano ainda está em análise no Asaas. Tente de novo em alguns minutos.";

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

/** Cancelling the monthly fee is never held up by a difference Asaas has not decided on. */
type RetireOptions = { cancelling?: boolean };

const IN_DISPUTE =
  "A diferença de plano está em contestação no Asaas. Fale com o suporte para trocar de plano.";
const DISPUTE_STATUS = /^(CHARGEBACK_|AWAITING_CHARGEBACK_|DUNNING_)/;

/**
 * Neither paid, open nor given back: a card in risk analysis, or a chargeback or collection under
 * way. A dispute reaches the team as a problem of its own. Changing plans waits for Asaas to
 * decide; cancelling never does, and leaves the difference where it is.
 */
function undecidedDifference(charge: { id: string; status: string }, options: RetireOptions): void {
  const disputed = DISPUTE_STATUS.test(charge.status);
  if (disputed) {
    logger.error("billing.difference_in_dispute", {
      problemKey: `difference-dispute:${charge.id}`,
      chargeId: charge.id,
      status: charge.status,
    });
  }
  if (options.cancelling === true) return;
  throw conflictError(disputed ? IN_DISPUTE : STILL_IN_REVIEW);
}

/**
 * An upgrade difference still open is deleted. One already paid is synced: in time, it moved
 * the plan up and the action stops so the reseller sees it; too late, it was given back and the
 * action goes on. One given back before is left alone.
 */
async function retireDifference(
  client: AsaasBillingClient,
  chargeId: string,
  options: RetireOptions,
): Promise<void> {
  const charge = await readUnlessGone(async () => client.getCharge(chargeId));
  if (charge === null) return;
  if (isPaidCharge(charge)) {
    const outcome = await syncUpgradeCharge({ chargeId, eventId: null });
    if (outcome === "given_back") return;
    throw conflictError(outcome === "applied" ? PAID_MEANWHILE : CHANGED_MEANWHILE);
  }
  if (isOpenCharge(charge)) {
    await removeUnlessGone(async () => client.deleteCharge(chargeId));
    return;
  }
  if (!isGivenBackCharge(charge)) undecidedDifference(charge, options);
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
  options: RetireOptions = {},
): Promise<void> {
  const reference = account.pendingReference;
  assertNoPendingBillingCreation(reference);
  if (reference?.startsWith(CHARGE_REFERENCE) === true) {
    await retireDifference(client, reference.slice(CHARGE_REFERENCE.length), options);
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
