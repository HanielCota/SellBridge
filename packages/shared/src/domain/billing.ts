export const BILLING_PLANS = [
  { id: "free", name: "Gratuito", stores: 2, listings: 25 },
  { id: "pro", name: "Pro", stores: 10, listings: 500 },
  { id: "business", name: "Business", stores: 50, listings: 5000 },
] as const;

const PAID_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

const DAY_MILLISECONDS = 86_400_000;

export type BillingPlanId = (typeof BILLING_PLANS)[number]["id"];

export function effectiveBillingPlan(
  subscription: {
    plan: string;
    status: string;
    periodEnd: Date | null;
  } | null,
  now = new Date(),
) {
  // past_due keeps the plan while the grace the webhook wrote into periodEnd lasts (item 16, N9).
  const paid =
    subscription &&
    PAID_STATUSES.includes(subscription.status) &&
    subscription.periodEnd &&
    subscription.periodEnd > now;
  return (
    BILLING_PLANS.find((plan) => plan.id === (paid ? subscription.plan : "free")) ??
    BILLING_PLANS[0]
  );
}

/**
 * When a past_due subscription loses its paid limits: the failed renewal (the period start) plus
 * the grace, never past the period Stripe would bill next.
 */
export function pastDueAccessEnd(
  period: { periodStart: Date; periodEnd: Date },
  graceDays: number,
): Date {
  const graceEnd = period.periodStart.getTime() + graceDays * DAY_MILLISECONDS;
  return new Date(Math.min(graceEnd, period.periodEnd.getTime()));
}

export type BillingNotice = { kind: "past_due"; accessUntil: Date } | { kind: "payment_failed" };

/** What the reseller must hear about the subscription: a payment to fix, or nothing. */
export function billingNotice(
  subscription: { status: string; periodEnd: Date | null } | null,
  now = new Date(),
): BillingNotice | null {
  if (subscription === null) return null;
  if (!["past_due", "unpaid"].includes(subscription.status)) return null;
  const { periodEnd } = subscription;
  if (subscription.status === "past_due" && periodEnd !== null && periodEnd > now) {
    return { kind: "past_due", accessUntil: periodEnd };
  }
  return { kind: "payment_failed" };
}
