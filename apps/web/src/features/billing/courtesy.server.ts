import {
  deleteBillingCourtesy,
  getBillingAccount,
  getBillingCourtesy,
  saveBillingCourtesy,
} from "@sellbridge/database/repositories";
import {
  billingPlan,
  courtesyBillingPlan,
  isBillingPlanId,
  type BillingPlanId,
} from "@sellbridge/shared/billing";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import { database } from "@/lib/server/database";
import { billingClientForCleanup } from "./billing-config.server";
import { withBillingLock } from "./billing-lock.server";
import { stopCharging } from "./subscription-cancel.server";

type BillingAccount = NonNullable<Awaited<ReturnType<typeof getBillingAccount>>>;
type BillingCourtesy = NonNullable<Awaited<ReturnType<typeof getBillingCourtesy>>>;

export interface CourtesyGrant {
  tenantId: string;
  plan: BillingPlanId;
  /** The first moment without the plan; null never runs out. */
  expiresAt: Date | null;
  reason: string;
  adminId: string;
}

const NO_ASAAS_ACCOUNT =
  "Esta conta tem uma assinatura no Asaas, mas o SellBridge está sem acesso ao Asaas agora. Cancele a assinatura no painel do Asaas antes de conceder a cortesia.";

function renews(account: BillingAccount): boolean {
  return account.subscriptionId !== null && !account.cancelAtPeriodEnd;
}

/**
 * An account never pays for a plan it was given: what it pays or was about to pay stops before
 * the courtesy is saved, and a failure there leaves the account as it was. True when a
 * subscription stopped renewing.
 */
async function stopPaidPlan(tenantId: string): Promise<boolean> {
  const account = await getBillingAccount(database, tenantId);
  if (account === null) return false;
  if (!renews(account) && account.pendingReference === null) return false;
  const client = billingClientForCleanup();
  if (client === null) throw conflictError(NO_ASAAS_ACCOUNT);
  await stopCharging(client, account);
  return renews(account);
}

/**
 * Gives the tenant a plan with no charge, or changes the one it has. Nothing is created at the
 * payment provider because of it.
 *
 * @throws {AppError} VALIDATION when the end is not in the future; CONFLICT or EXTERNAL_PROVIDER
 * when the subscription the account pays could not be stopped (nothing is saved then).
 */
export async function grantCourtesy(
  grant: CourtesyGrant,
  now = new Date(),
): Promise<{ previous: BillingCourtesy | null; renewalStopped: boolean }> {
  if (grant.expiresAt !== null && grant.expiresAt <= now) {
    throw validationError("Escolha uma data de hoje em diante para o fim da cortesia.");
  }
  return withBillingLock(grant.tenantId, async () => {
    const previous = await getBillingCourtesy(database, grant.tenantId);
    const renewalStopped = await stopPaidPlan(grant.tenantId);
    await saveBillingCourtesy(database, {
      tenantId: grant.tenantId,
      plan: grant.plan,
      expiresAt: grant.expiresAt,
      reason: grant.reason,
      grantedBy: grant.adminId,
    });
    return { previous, renewalStopped };
  });
}

/**
 * Takes the courtesy plan back now: the account is left with what it pays, if anything. Runs
 * under the same lock as a grant, so it never deletes one given a moment before it read.
 *
 * @throws {AppError} CONFLICT when the tenant has no courtesy plan, or another change of its
 * subscription is still running.
 */
export async function revokeCourtesy(tenantId: string): Promise<BillingCourtesy> {
  return withBillingLock(tenantId, async () => {
    const courtesy = await getBillingCourtesy(database, tenantId);
    if (courtesy === null || !(await deleteBillingCourtesy(database, tenantId))) {
      throw conflictError("Esta conta não tem um plano por cortesia.");
    }
    return courtesy;
  });
}

function paidPlanName(account: BillingAccount | null): string | null {
  if (account === null || !renews(account) || !isBillingPlanId(account.plan)) return null;
  return billingPlan(account.plan).name;
}

/** What the team sees before giving, changing or taking back a courtesy plan. */
export async function courtesyOverview(tenantId: string, now = new Date()) {
  const [courtesy, account] = await Promise.all([
    getBillingCourtesy(database, tenantId),
    getBillingAccount(database, tenantId),
  ]);
  const inForce = courtesyBillingPlan(courtesy, now);
  return {
    courtesy:
      courtesy === null || inForce === null
        ? null
        : {
            planId: inForce.id,
            planName: inForce.name,
            expiresAt: courtesy.expiresAt?.toISOString() ?? null,
            reason: courtesy.reason,
          },
    /** The plan the account pays for and would stop renewing; null when it pays nothing. */
    paidPlanName: paidPlanName(account),
  };
}
