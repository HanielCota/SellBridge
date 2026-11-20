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
import { CHARGE_REFERENCE, CHECKOUT_REFERENCE, CREATION_REFERENCE } from "./pending-reference";

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

/** Something Asaas no longer has is no longer waiting for payment. */
async function readUnlessGone<Result>(read: () => Promise<Result>): Promise<Result | null> {
  try {
    return await read();
  } catch (error) {
    if (isAsaasError(error) && error.status === 404) return null;
    throw error;
  }
}

/**
 * The local status lags behind a delayed notice: what Asaas already has as paid is synced
 * instead of deleted, and the action stops so the reseller sees the plan it paid for.
 */
async function assertStillUnpaid(
  client: AsaasBillingClient,
  account: BillingAccount,
): Promise<void> {
  const reference = account.pendingReference;
  if (reference?.startsWith(CHARGE_REFERENCE) === true) {
    const chargeId = reference.slice(CHARGE_REFERENCE.length);
    const charge = await readUnlessGone(async () => client.getCharge(chargeId));
    if (charge !== null && isPaidCharge(charge)) {
      await syncUpgradeCharge({ chargeId, eventId: null });
      throw conflictError(PAID_MEANWHILE);
    }
  }
  const { subscriptionId } = account;
  if (subscriptionId === null || account.status !== "incomplete") return;
  const charges = await readUnlessGone(async () => client.listSubscriptionCharges(subscriptionId));
  if (charges?.some(isPaidCharge) === true) {
    await syncBillingSubscription({ subscriptionId, eventId: null });
    throw conflictError(PAID_MEANWHILE);
  }
}

/** Closes what was opened and never paid, so an old link cannot start a second subscription. */
export async function retireUnpaid(
  client: AsaasBillingClient,
  account: BillingAccount,
): Promise<void> {
  const reference = account.pendingReference;
  assertNoPendingBillingCreation(reference);
  await assertStillUnpaid(client, account);
  const steps: Promise<unknown>[] = [];
  if (reference?.startsWith(CHECKOUT_REFERENCE) === true) {
    steps.push(client.cancelCheckout(reference.slice(CHECKOUT_REFERENCE.length)));
  }
  if (reference?.startsWith(CHARGE_REFERENCE) === true) {
    steps.push(client.deleteCharge(reference.slice(CHARGE_REFERENCE.length)));
  }
  if (account.subscriptionId !== null && account.status === "incomplete") {
    steps.push(client.deleteSubscription(account.subscriptionId));
  }
  const results = await Promise.allSettled(steps);
  for (const result of results) {
    if (result.status !== "rejected") {
      continue;
    }

    const error: unknown = result.reason;
    if (isAsaasError(error) && error.status === 404) {
      continue;
    }

    throw error;
  }
}
