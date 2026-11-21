import { getCustomer, recordAdminEvent } from "@sellbridge/database/repositories";
import { courtesyBillingPlan } from "@sellbridge/shared/billing";
import { notFoundError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { endOfBrazilDay } from "@sellbridge/shared/period-range";
import type { GrantCourtesyInput } from "@sellbridge/shared/schemas";
import { grantCourtesy, revokeCourtesy } from "@/features/billing/courtesy.server";
import { database } from "@/lib/server/database";

/** The reseller profile a courtesy plan goes to: the account's oldest, the one the team sees. */
async function resellerTenant(userId: string): Promise<string> {
  const customer = await getCustomer(database, userId);
  if (customer === null) {
    throw notFoundError("Cliente não encontrado");
  }
  if (customer.tenantId == null || customer.tenantId === "") {
    throw notFoundError("Este cliente ainda não tem um perfil de revenda");
  }
  return customer.tenantId;
}

function endOfLastDay(lastDay: string | null): Date | null {
  if (lastDay === null) return null;
  const end = endOfBrazilDay(lastDay);
  if (end === null) {
    throw validationError("Escolha uma data válida para o fim da cortesia.");
  }
  return end;
}

/**
 * Gives the customer a plan with no charge (or changes it) and writes who did it, when, what and
 * why to the team's trail.
 */
export async function grantCustomerCourtesy(
  adminId: string,
  input: GrantCourtesyInput,
  now = new Date(),
) {
  const tenantId = await resellerTenant(input.userId);
  const expiresAt = endOfLastDay(input.lastDay);
  const { previous, renewalStopped } = await grantCourtesy(
    { tenantId, plan: input.plan, expiresAt, reason: input.reason, adminId },
    now,
  );
  const changed = courtesyBillingPlan(previous, now) !== null;
  const action = changed ? "courtesy_changed" : "courtesy_granted";
  logger.info(`admin.customer_${action}`, { adminId, userId: input.userId, plan: input.plan });
  await recordAdminEvent(database, {
    adminId,
    userId: input.userId,
    action,
    details: {
      plan: input.plan,
      expiresAt: expiresAt?.toISOString() ?? null,
      reason: input.reason,
      renewalStopped,
      previousPlan: changed ? (previous?.plan ?? null) : null,
    },
  });
  return { ok: true, renewalStopped };
}

/** Takes the courtesy plan back now and writes it, with the reason, to the team's trail. */
export async function revokeCustomerCourtesy(
  adminId: string,
  input: { userId: string; reason: string },
) {
  const tenantId = await resellerTenant(input.userId);
  const taken = await revokeCourtesy(tenantId);
  logger.info("admin.customer_courtesy_revoked", { adminId, userId: input.userId });
  await recordAdminEvent(database, {
    adminId,
    userId: input.userId,
    action: "courtesy_revoked",
    details: { plan: taken.plan, reason: input.reason },
  });
  return { ok: true };
}
