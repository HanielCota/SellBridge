/**
 * The client's master plan (18/11/2026): five paid plans, no free plan and no trial. Names and
 * prices come from the client; the store and listing limits were approved with the plan table.
 * Asaas charges `priceCents` every month (decision of 19/11/2026).
 */
export const BILLING_PLANS = [
  {
    id: "start",
    priceCents: 9_700,
    name: "Start",
    stores: 3,
    listings: 300,
    prioritySupport: false,
  },
  {
    id: "pro",
    priceCents: 19_700,
    name: "Pro",
    stores: 5,
    listings: 1_000,
    prioritySupport: false,
  },
  {
    id: "business",
    priceCents: 39_700,
    name: "Business",
    stores: 10,
    listings: 3_000,
    prioritySupport: false,
  },
  {
    id: "black",
    priceCents: 69_700,
    name: "Black",
    stores: 20,
    listings: 8_000,
    prioritySupport: false,
  },
  {
    id: "elite",
    priceCents: 99_700,
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

/**
 * The plan with this id.
 *
 * @throws {Error} When the id is not one of `BILLING_PLANS` (a type guard was skipped).
 */
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
  /** A smaller plan the reseller chose: it replaces `plan` from `scheduledPlanAt` on. */
  scheduledPlan?: string | null;
  scheduledPlanAt?: Date | null;
}

/** The plan the subscription pays for at `now`: a scheduled smaller plan once its day comes. */
function planInForce(subscription: BillingSubscriptionState, now: Date): string {
  const { scheduledPlan, scheduledPlanAt } = subscription;
  if (scheduledPlan == null || scheduledPlanAt == null || scheduledPlanAt > now) {
    return subscription.plan;
  }
  return scheduledPlan;
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
  const plan = planInForce(subscription, now);
  if (!isBillingPlanId(plan)) return null;
  return billingPlan(plan);
}

/** A plan the team gave the account with no charge; `expiresAt` null never runs out. */
export interface BillingCourtesyState {
  plan: string;
  expiresAt: Date | null;
}

/** The courtesy plan in force, or null without one, past its end or for an unknown plan. */
export function courtesyBillingPlan(
  courtesy: BillingCourtesyState | null,
  now = new Date(),
): BillingPlan | null {
  if (courtesy === null) return null;
  if (courtesy.expiresAt !== null && courtesy.expiresAt <= now) return null;
  if (!isBillingPlanId(courtesy.plan)) return null;
  return billingPlan(courtesy.plan);
}

/**
 * What moving up costs for the rest of the paid month: the price difference times the share of
 * the period still ahead, rounded to the cent. Zero when the new plan is not dearer or the
 * period is over.
 *
 * @throws {RangeError} When the period does not end after it starts or a price is not whole cents.
 */
export function upgradeDifferenceCents(input: {
  fromPriceCents: number;
  toPriceCents: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): number {
  const { fromPriceCents, toPriceCents, periodStart, periodEnd, now } = input;
  if (!Number.isSafeInteger(fromPriceCents) || !Number.isSafeInteger(toPriceCents)) {
    throw new RangeError(`Plan prices must be whole cents: ${fromPriceCents}, ${toPriceCents}`);
  }
  const periodLength = periodEnd.getTime() - periodStart.getTime();
  if (!Number.isFinite(periodLength) || periodLength <= 0) {
    throw new RangeError(`Paid period must end after it starts: ${periodLength} ms`);
  }
  const difference = toPriceCents - fromPriceCents;
  const remaining = Math.min(Math.max(periodEnd.getTime() - now.getTime(), 0), periodLength);
  if (difference <= 0 || remaining === 0) return 0;
  return Math.round((difference * remaining) / periodLength);
}

/** What an account may use now. */
export type BillingAccess =
  | { kind: "plan"; plan: BillingPlan; source: "subscription" | "courtesy" }
  | { kind: "transition"; until: Date }
  | { kind: "none" };

/** What decides an account's access: what it pays, what the team gave it and the launch. */
export interface BillingAccessInput {
  subscription: BillingSubscriptionState | null;
  courtesy: BillingCourtesyState | null;
  tenantCreatedAt: Date;
  transition: BillingTransition | null;
}

function transitionEnd(input: BillingAccessInput, now: Date): Date | null {
  const { transition } = input;
  if (transition === null) return null;
  if (input.tenantCreatedAt >= transition.launchedAt) return null;
  if (now >= transition.endsAt) return null;
  return transition.endsAt;
}

/**
 * A paid plan counts first, unless the courtesy plan is at least as large (a month still paid
 * after the courtesy stopped its renewal). An account in the launch transition keeps its
 * unlimited access over a courtesy plan, which only takes over when the transition ends.
 */
export function billingAccess(input: BillingAccessInput, now = new Date()): BillingAccess {
  const paid = paidBillingPlan(input.subscription, now);
  const courtesy = courtesyBillingPlan(input.courtesy, now);
  if (paid !== null && (courtesy === null || paid.priceCents > courtesy.priceCents)) {
    return { kind: "plan", plan: paid, source: "subscription" };
  }
  if (paid !== null && courtesy !== null) {
    return { kind: "plan", plan: courtesy, source: "courtesy" };
  }
  const until = transitionEnd(input, now);
  if (until !== null) return { kind: "transition", until };
  if (courtesy !== null) return { kind: "plan", plan: courtesy, source: "courtesy" };
  return { kind: "none" };
}

/** Store and listing ceilings of the access; null means no ceiling (the launch transition). */
export function billingLimits(access: BillingAccess): { stores: number; listings: number } | null {
  if (access.kind === "transition") return null;
  if (access.kind === "none") return { stores: 0, listings: 0 };
  return { stores: access.plan.stores, listings: access.plan.listings };
}

export type BillingNotice =
  | { kind: "past_due"; accessUntil: Date }
  | { kind: "payment_failed" }
  | { kind: "transition"; until: Date; endingSoon: boolean }
  | { kind: "courtesy_ending"; until: Date }
  | { kind: "no_plan" };

/** Days before a courtesy plan ends when the account and the team start hearing about it. */
export const COURTESY_WARNING_DAYS = 7;

/** When the courtesy in force ends, once that is at most `COURTESY_WARNING_DAYS` away. */
export function courtesyEndingAt(
  courtesy: BillingCourtesyState | null,
  now = new Date(),
): Date | null {
  if (courtesyBillingPlan(courtesy, now) === null) return null;
  const expiresAt = courtesy?.expiresAt ?? null;
  if (expiresAt === null) return null;
  const warningStart = expiresAt.getTime() - COURTESY_WARNING_DAYS * DAY_MILLISECONDS;
  return now.getTime() >= warningStart ? expiresAt : null;
}

/**
 * What the reseller must hear about the subscription: a payment to fix, the launch transition
 * running out, a courtesy plan about to end, a plan to choose, or nothing. An account with a
 * courtesy plan in force owes nothing and has nothing to choose until it ends.
 */
export function billingNotice(input: BillingAccessInput, now = new Date()): BillingNotice | null {
  const { subscription } = input;
  if (courtesyBillingPlan(input.courtesy, now) !== null) {
    const until = courtesyEndingAt(input.courtesy, now);
    return until === null ? null : { kind: "courtesy_ending", until };
  }
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
