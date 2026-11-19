import { conflictError } from "@sellbridge/shared/errors";
import {
  nextReceivingRules,
  PAYMENT_NEEDS_ACCOUNT_MESSAGE,
  RECEIVING_RULES_OFF,
  type ReceivingRules,
  type ReceivingRulesChoice,
} from "@sellbridge/shared/receiving-rules";
import { and, count, eq, not } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { platformSettings, suppliers } from "../schema/index.ts";
import { publicSupplier, receivingAccountApproved } from "./sql/sellable.ts";

const rulesColumns = {
  receivingAccountSince: platformSettings.requireReceivingAccountSince,
  paymentBeforePreparingSince: platformSettings.paymentBeforePreparingSince,
};

export async function getReceivingRules(database: DatabaseExecutor): Promise<ReceivingRules> {
  const [row] = await database
    .select(rulesColumns)
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  return row ?? RECEIVING_RULES_OFF;
}

/**
 * Saves the admin's choice; a switch already on keeps the instant it was turned on.
 *
 * @throws {AppError} CONFLICT when paying first is asked without the receiving-account rule.
 */
export async function setReceivingRules(
  database: Database,
  input: ReceivingRulesChoice & { userId: string; now: Date },
): Promise<ReceivingRules> {
  if (input.paymentBeforePreparing && !input.requireReceivingAccount) {
    throw conflictError(PAYMENT_NEEDS_ACCOUNT_MESSAGE);
  }
  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select(rulesColumns)
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .for("update");
    const next = nextReceivingRules(current ?? RECEIVING_RULES_OFF, input, input.now);
    const values = {
      requireReceivingAccountSince: next.receivingAccountSince,
      paymentBeforePreparingSince: next.paymentBeforePreparingSince,
      updatedByUserId: input.userId,
      updatedAt: input.now,
    };
    await transaction
      .insert(platformSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: platformSettings.id, set: values });
    return next;
  });
}

/** Active public suppliers without an approved receiving account: who the account rule hides. */
export async function countSuppliersWithoutReceivingAccount(
  database: DatabaseExecutor,
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(suppliers)
    .where(and(publicSupplier(), eq(suppliers.active, true), not(receivingAccountApproved())));
  return row?.total ?? 0;
}
