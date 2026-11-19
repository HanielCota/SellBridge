import {
  countSuppliersWithoutReceivingAccount,
  getReceivingRules,
  setReceivingRules,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  receivingRulesRefusal,
  type ReceivingRules,
  type ReceivingRulesChoice,
} from "@sellbridge/shared/receiving-rules";
import { database } from "@/lib/server/database";
import { asaasContext } from "./asaas.server";

async function present(rules: ReceivingRules) {
  return {
    suppliersWithoutAccount: await countSuppliersWithoutReceivingAccount(database),
    requireReceivingAccount: rules.receivingAccountSince !== null,
    receivingAccountSince: rules.receivingAccountSince?.toISOString() ?? null,
    paymentBeforePreparing: rules.paymentBeforePreparingSince !== null,
    paymentBeforePreparingSince: rules.paymentBeforePreparingSince?.toISOString() ?? null,
    asaasAvailable: asaasContext() !== null,
  };
}

/** The admin's two receiving switches, and whether Asaas is configured to turn them on. */
export async function loadReceivingRules() {
  return present(await getReceivingRules(database));
}

/**
 * Saves the admin's choice.
 *
 * @throws When paying first is asked without the account rule, or Asaas is not configured.
 */
export async function saveReceivingRules(input: ReceivingRulesChoice & { userId: string }) {
  const refusal = receivingRulesRefusal(input, asaasContext() !== null);
  if (refusal !== null) {
    throw validationError(refusal);
  }
  const saved = await setReceivingRules(database, { ...input, now: new Date() });
  logger.info("supplier_payments.receiving_rules_saved", {
    requireReceivingAccount: saved.receivingAccountSince !== null,
    paymentBeforePreparing: saved.paymentBeforePreparingSince !== null,
  });
  return present(saved);
}
