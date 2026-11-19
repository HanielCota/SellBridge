import { randomUUID } from "node:crypto";
import {
  getBillingAccount,
  saveBillingAccount,
  tryLockBillingCheckout,
} from "@sellbridge/database/repositories";
import { isAsaasError, type AsaasBillingClient } from "@sellbridge/payments/asaas";
import { AppError, conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { CHARGE_REFERENCE, CHECKOUT_REFERENCE, CREATION_REFERENCE } from "./pending-reference";

type BillingAccount = NonNullable<Awaited<ReturnType<typeof getBillingAccount>>>;

export const UNREACHABLE_MESSAGE =
  "Não conseguimos falar com o Asaas agora. Tente de novo em alguns minutos.";

/** One subscription change per tenant at a time; it holds no row, only an advisory lock. */
export async function withBillingLock<Result>(tenantId: string, run: () => Promise<Result>) {
  try {
    return await database.transaction(async (transaction) => {
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

/** Closes what was opened and never paid, so an old link cannot start a second subscription. */
export async function retireUnpaid(
  client: AsaasBillingClient,
  account: BillingAccount,
): Promise<void> {
  const reference = account.pendingReference;
  assertNoPendingBillingCreation(reference);
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
