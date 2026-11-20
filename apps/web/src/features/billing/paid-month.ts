import { billingPlan, isBillingPlanId, type BillingPlan } from "@sellbridge/shared/billing";

/**
 * The paid month a new subscription may start after: only one fully paid (not running on the
 * late-payment grace), not yet over, and for a plan that costs at least as much as the new one.
 * A dearer plan is charged at once instead: carrying the month over would give it away.
 */
export function paidMonthCarriedTo(
  account: { plan: string; status: string; periodEnd: Date | null } | null,
  plan: BillingPlan,
  now: Date,
): Date | null {
  if (account === null || account.periodEnd === null) return null;
  if (account.status !== "active" || account.periodEnd <= now) return null;
  if (!isBillingPlanId(account.plan)) return null;
  if (plan.priceCents > billingPlan(account.plan).priceCents) return null;
  return account.periodEnd;
}
