import {
  BILLING_PLANS,
  billingAccess,
  billingLimits,
  billingNotice,
  courtesyBillingPlan,
  type BillingAccess,
  type BillingCourtesyState,
  type BillingNotice,
} from "@sellbridge/shared/billing";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  billingUsage,
  findBillingAccess,
  findBillingAccessInput,
  getBillingAccount,
  requireBillingOwner,
} from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
import { billingEnabled, billingRules } from "./billing-config.server";
import type { BillingNoticeView } from "./billing-notice";
import { syncBillingSubscription, syncUpgradeCharge } from "./billing-sync.server";
import { CHARGE_REFERENCE, SUBSCRIPTION_REFERENCE } from "./pending-reference";
import type { NewStoreBlock } from "./new-store-block";

type BillingAccount = NonNullable<Awaited<ReturnType<typeof getBillingAccount>>>;

const DAY_IN_MS = 86_400_000;
/** Within this of its end, a paid month is read again on the visit: the renewal may be in. */
const REFRESH_BEFORE_END_IN_MS = 2 * DAY_IN_MS;

/** The access as the page shows it: dates as ISO strings, limits null while unlimited. */
function accessView(access: BillingAccess | null) {
  if (access === null) {
    return { kind: "unlimited" as const, limits: null };
  }

  const limits = billingLimits(access);
  if (access.kind === "plan") {
    return { kind: "plan" as const, planId: access.plan.id, source: access.source, limits };
  }
  if (access.kind === "transition") {
    return { kind: "transition" as const, until: access.until.toISOString(), limits };
  }

  if (access.kind === "free") {
    return { ...access, limits };
  }

  return { kind: "none" as const, limits };
}

/**
 * The plan the team gave with no charge, while it lasts: shown even with billing off or during
 * the launch transition, when it does not limit anything yet.
 */
function courtesyView(courtesy: BillingCourtesyState | null) {
  const plan = courtesyBillingPlan(courtesy);
  if (courtesy === null || plan === null) return null;
  return { planId: plan.id, expiresAt: courtesy.expiresAt?.toISOString() ?? null };
}

/** What the page shows of the subscription: no provider ids. */
function subscriptionView(account: BillingAccount | null) {
  if (account === null) return null;
  const upgrading = account.pendingReference?.startsWith(CHARGE_REFERENCE) === true;
  return {
    status: account.status,
    plan: account.plan,
    periodEnd: account.periodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
    paymentMethod: account.paymentMethod,
    scheduledPlan: account.scheduledPlan,
    scheduledPlanAt: account.scheduledPlanAt?.toISOString() ?? null,
    upgradePlan: upgrading ? account.pendingPlan : null,
    hasSubscription: account.subscriptionId !== null,
  };
}

function needsRefresh(account: BillingAccount): boolean {
  if (account.status !== "active" || account.periodEnd === null) return true;
  return account.periodEnd.getTime() - Date.now() < REFRESH_BEFORE_END_IN_MS;
}

/**
 * Asaas resends a notice for days, but a lost one must not cost a paid plan: the page reads
 * the subscription again whenever a payment is due or waiting.
 */
async function refreshOnVisit(tenantId: string): Promise<void> {
  if (!billingEnabled()) return;
  const account = await getBillingAccount(database, tenantId);
  if (account === null) return;
  try {
    const reference = account.pendingReference;
    if (reference?.startsWith(CHARGE_REFERENCE) === true) {
      await syncUpgradeCharge({
        chargeId: reference.slice(CHARGE_REFERENCE.length),
        eventId: null,
      });
    }
    if (reference?.startsWith(SUBSCRIPTION_REFERENCE) === true) {
      await syncBillingSubscription({
        subscriptionId: reference.slice(SUBSCRIPTION_REFERENCE.length),
        eventId: null,
      });
    }
    if (account.subscriptionId !== null && needsRefresh(account)) {
      await syncBillingSubscription({ subscriptionId: account.subscriptionId, eventId: null });
    }
  } catch (error) {
    logger.warn("billing.refresh_failed", { error });
  }
}

async function isOwner(tenantId: string, userId: string): Promise<boolean> {
  try {
    await requireBillingOwner(database, tenantId, userId);
    return true;
  } catch (error) {
    if (isAppError(error) && error.code === "FORBIDDEN") return false;
    throw error;
  }
}

export async function billingSummary(tenantId: string, userId: string) {
  await refreshOnVisit(tenantId);
  const rules = billingRules();
  const [input, usage, canManage] = await Promise.all([
    findBillingAccessInput(database, tenantId, rules ?? { transition: null }),
    billingUsage(database, tenantId),
    isOwner(tenantId, userId),
  ]);
  const enabled = rules !== null;
  const now = new Date();
  return {
    subscription: subscriptionView(input.subscription),
    usage,
    plans: BILLING_PLANS,
    prices: enabled
      ? BILLING_PLANS.map((plan) => ({ id: plan.id, priceCents: plan.priceCents }))
      : [],
    canManage,
    notice: enabled ? noticeView(billingNotice(input, now)) : null,
    access: accessView(enabled ? billingAccess(input, now) : null),
    courtesy: courtesyView(input.courtesy),
    enabled,
  };
}

function noticeView(notice: BillingNotice | null): BillingNoticeView | null {
  if (notice === null) return null;
  if (notice.kind === "past_due") {
    return { kind: "past_due", accessUntil: notice.accessUntil.toISOString() };
  }
  if (notice.kind === "transition") {
    return { kind: "transition", until: notice.until.toISOString(), endingSoon: notice.endingSoon };
  }
  if (notice.kind === "courtesy_ending") {
    return { kind: "courtesy_ending", until: notice.until.toISOString() };
  }
  return notice;
}

export async function findBillingNotice(tenantId: string): Promise<BillingNoticeView | null> {
  const rules = billingRules();
  if (rules === null) {
    return null;
  }

  return noticeView(billingNotice(await findBillingAccessInput(database, tenantId, rules)));
}

/** Why a new store cannot be connected now, or null when it fits (or billing is off). */
export async function findNewStoreBlock(tenantId: string): Promise<NewStoreBlock | null> {
  const rules = billingRules();
  if (rules === null) return null;
  const [access, usage] = await Promise.all([
    findBillingAccess(database, tenantId, rules),
    billingUsage(database, tenantId),
  ]);
  const limits = billingLimits(access);
  if (limits === null || usage.stores < limits.stores) return null;
  if (access.kind === "plan") return { kind: "plan_full", planName: access.plan.name };
  if (access.kind === "free") {
    return { kind: "plan_full", planName: "Gratuito" };
  }

  return { kind: "choose_plan" };
}

/**
 * The whole days of a paid plan still ahead, counting today: deleting the account gives them
 * up, with no refund. Null without a paid plan.
 */
export async function findPaidDaysLeft(
  tenantId: string,
): Promise<{ planName: string; days: number } | null> {
  const rules = billingRules();
  if (rules === null) return null;
  const [access, account] = await Promise.all([
    findBillingAccess(database, tenantId, rules),
    getBillingAccount(database, tenantId),
  ]);
  if (access.kind !== "plan" || access.source !== "subscription") return null;
  if (account?.periodEnd == null) return null;
  const days = Math.ceil((account.periodEnd.getTime() - Date.now()) / DAY_IN_MS);
  return days > 0 ? { planName: access.plan.name, days } : null;
}

/** Whether the tenant's plan answers its tickets first (Elite). */
export async function hasPrioritySupport(tenantId: string): Promise<boolean> {
  const rules = billingRules();
  if (rules === null) return false;
  const access = await findBillingAccess(database, tenantId, rules);
  return access.kind === "plan" && access.plan.prioritySupport;
}
