/**
 * The client's master plan (18/11/2026): five paid plans, no free plan and no trial. Names and
 * prices come from the client; the store and listing limits were approved with the plan table.
 * Prices live in Stripe.
 */
export const BILLING_PLANS = [
  {
    id: "start",
    name: "Start",
    stores: 3,
    listings: 300,
    prioritySupport: false,
  },
  {
    id: "pro",
    name: "Pro",
    stores: 5,
    listings: 1_000,
    prioritySupport: false,
  },
  {
    id: "business",
    name: "Business",
    stores: 10,
    listings: 3_000,
    prioritySupport: false,
  },
  {
    id: "black",
    name: "Black",
    stores: 20,
    listings: 8_000,
    prioritySupport: false,
  },
  {
    id: "elite",
    name: "Elite",
    stores: 40,
    listings: 20_000,
    prioritySupport: true,
  },
] as const;

export type BillingPlan = (typeof BILLING_PLANS)[number];
export type BillingPlanId = BillingPlan["id"];

export const BILLING_PLAN_IDS = ["start", "pro", "business", "black", "elite"] as const;

const PAID_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

const DAY_MILLISECONDS = 86_400_000;

/** Days before the transition ends when its notice turns from information into a warning. */
export const TRANSITION_WARNING_DAYS = 7;

export function isBillingPlanId(value: string): value is BillingPlanId {
  return BILLING_PLANS.some((plan) => plan.id === value);
}

export function billingPlan(id: BillingPlanId): BillingPlan {
  const plan = BILLING_PLANS.find((candidate) => candidate.id === id);
  if (plan === undefined) {
    throw new Error(`Unknown billing plan: ${id}`);
  }
  return plan;
}

/**
 * The launch of paid plans: accounts created before `launchedAt` keep today's access, with no
 * limits, until `endsAt`. Accounts created after the launch never get it (no trial).
 */
export interface BillingTransition {
  launchedAt: Date;
  endsAt: Date;
}

/** How the plan limits apply when billing is on. Null where billing is off: no limits at all. */
export interface BillingRules {
  transition: BillingTransition | null;
}

export interface BillingSubscriptionState {
  plan: string;
  status: string;
  periodEnd: Date | null;
}

/** The paid plan in force, or null without a paid, current subscription to a known plan. */
export function paidBillingPlan(
  subscription: BillingSubscriptionState | null,
  now = new Date(),
): BillingPlan | null {
  if (subscription === null) return null;
  if (!PAID_STATUSES.includes(subscription.status)) return null;
  // past_due keeps the plan while the grace the webhook wrote into periodEnd lasts (item 16, N9).
  if (subscription.periodEnd === null || subscription.periodEnd <= now) return null;
  if (!isBillingPlanId(subscription.plan)) return null;
  return billingPlan(subscription.plan);
}

/** What an account may use now. */
export type BillingAccess =
  { kind: "plan"; plan: BillingPlan } | { kind: "transition"; until: Date } | { kind: "none" };

export function billingAccess(
  input: {
    subscription: BillingSubscriptionState | null;
    tenantCreatedAt: Date;
    transition: BillingTransition | null;
  },
  now = new Date(),
): BillingAccess {
  const plan = paidBillingPlan(input.subscription, now);
  if (plan !== null) return { kind: "plan", plan };
  const { transition } = input;
  if (transition === null) return { kind: "none" };
  if (input.tenantCreatedAt >= transition.launchedAt) return { kind: "none" };
  if (now >= transition.endsAt) return { kind: "none" };
  return { kind: "transition", until: transition.endsAt };
}

/** Store and listing ceilings of the access; null means no ceiling (the launch transition). */
export function billingLimits(access: BillingAccess): { stores: number; listings: number } | null {
  if (access.kind === "transition") return null;
  if (access.kind === "none") return { stores: 0, listings: 0 };
  return { stores: access.plan.stores, listings: access.plan.listings };
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

export type BillingNotice =
  | { kind: "past_due"; accessUntil: Date }
  | { kind: "payment_failed" }
  | { kind: "transition"; until: Date; endingSoon: boolean }
  | { kind: "no_plan" };

/**
 * What the reseller must hear about the subscription: a payment to fix, the launch transition
 * running out, a plan to choose, or nothing.
 */
export function billingNotice(
  input: {
    subscription: BillingSubscriptionState | null;
    tenantCreatedAt: Date;
    transition: BillingTransition | null;
  },
  now = new Date(),
): BillingNotice | null {
  const { subscription } = input;
  if (subscription?.status === "past_due") {
    const { periodEnd } = subscription;
    if (periodEnd !== null && periodEnd > now) return { kind: "past_due", accessUntil: periodEnd };
  }
  const access = billingAccess(input, now);
  if (access.kind === "plan") return null;
  if (subscription !== null && ["past_due", "unpaid"].includes(subscription.status)) {
    return { kind: "payment_failed" };
  }
  if (access.kind === "transition") {
    const warningStart = access.until.getTime() - TRANSITION_WARNING_DAYS * DAY_MILLISECONDS;
    return { kind: "transition", until: access.until, endingSoon: now.getTime() >= warningStart };
  }
  return { kind: "no_plan" };
}
