import { describe, expect, it } from "vitest";
import {
  BILLING_PLAN_IDS,
  BILLING_PLANS,
  billingAccess,
  billingLimits,
  billingNotice,
  paidBillingPlan,
  pastDueAccessEnd,
} from "./billing.ts";

const now = new Date("2026-12-10T12:00:00Z");
const subscription = { plan: "pro", status: "active", periodEnd: new Date("2027-01-10T12:00:00Z") };
const transition = {
  launchedAt: new Date("2026-12-01T12:00:00Z"),
  endsAt: new Date("2026-12-31T12:00:00Z"),
};
const existingTenant = new Date("2026-11-01T12:00:00Z");
const newTenant = new Date("2026-12-05T12:00:00Z");

describe("billing plans", () => {
  it("offers the client's five paid plans and no free plan", () => {
    expect(BILLING_PLANS.map((plan) => plan.name)).toEqual([
      "Start",
      "Pro",
      "Business",
      "Black",
      "Elite",
    ]);
    expect(BILLING_PLAN_IDS).toEqual(BILLING_PLANS.map((plan) => plan.id));
  });

  it("grows the limits with each plan", () => {
    const stores = BILLING_PLANS.map((plan) => plan.stores);
    const listings = BILLING_PLANS.map((plan) => plan.listings);
    expect(stores).toEqual(stores.toSorted((left, right) => left - right));
    expect(listings).toEqual(listings.toSorted((left, right) => left - right));
  });

  it("gives priority support only to Elite", () => {
    expect(BILLING_PLANS.filter((plan) => plan.prioritySupport).map((plan) => plan.id)).toEqual([
      "elite",
    ]);
  });
});

describe("paid plan", () => {
  it.each(["active", "trialing"])("grants the plan for %s within the period", (status) => {
    expect(paidBillingPlan({ ...subscription, status }, now)?.listings).toBe(1_000);
  });

  it.each(BILLING_PLAN_IDS)("recognizes the %s plan", (plan) => {
    expect(paidBillingPlan({ ...subscription, plan }, now)?.id).toBe(plan);
  });

  // Regression (item 16, N9): a failed renewal dropped the reseller's plan at once.
  it("keeps the plan for past_due until the grace period ends", () => {
    const graceEnd = new Date("2026-12-13T12:00:00Z");
    const pastDue = { ...subscription, status: "past_due", periodEnd: graceEnd };
    expect(paidBillingPlan(pastDue, now)?.id).toBe("pro");
    expect(paidBillingPlan(pastDue, graceEnd)).toBeNull();
  });

  it.each(["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"])(
    "revokes the plan for %s",
    (status) => {
      expect(paidBillingPlan({ ...subscription, status }, now)).toBeNull();
    },
  );

  it("revokes an expired subscription even without a cancellation webhook", () => {
    expect(paidBillingPlan({ ...subscription, periodEnd: now }, now)).toBeNull();
    expect(paidBillingPlan({ ...subscription, periodEnd: null }, now)).toBeNull();
  });

  it("grants nothing for an unknown plan, including the retired free plan", () => {
    expect(paidBillingPlan({ ...subscription, plan: "free" }, now)).toBeNull();
    expect(paidBillingPlan({ ...subscription, plan: "unrecognized" }, now)).toBeNull();
  });

  it("grants nothing without a subscription", () => {
    expect(paidBillingPlan(null, now)).toBeNull();
  });
});

describe("billing access", () => {
  it("uses the paid plan over the transition", () => {
    const access = billingAccess(
      { subscription, tenantCreatedAt: existingTenant, transition },
      now,
    );
    expect(access).toMatchObject({ kind: "plan", plan: { id: "pro" } });
  });

  it("keeps an account from before the launch unlimited during the transition", () => {
    const access = billingAccess(
      { subscription: null, tenantCreatedAt: existingTenant, transition },
      now,
    );
    expect(access).toEqual({ kind: "transition", until: transition.endsAt });
    expect(billingLimits(access)).toBeNull();
  });

  it("gives an account created after the launch no free period", () => {
    const access = billingAccess(
      { subscription: null, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(access).toEqual({ kind: "none" });
  });

  it("ends the transition on its last moment", () => {
    const access = billingAccess(
      { subscription: null, tenantCreatedAt: existingTenant, transition },
      transition.endsAt,
    );
    expect(access).toEqual({ kind: "none" });
  });

  it("has no transition when none is configured", () => {
    const access = billingAccess(
      { subscription: null, tenantCreatedAt: existingTenant, transition: null },
      now,
    );
    expect(access).toEqual({ kind: "none" });
  });

  it("lets an account without a plan add no store and no listing", () => {
    expect(billingLimits({ kind: "none" })).toEqual({ stores: 0, listings: 0 });
  });

  it("limits a paid account to its plan", () => {
    const access = billingAccess(
      { subscription: { ...subscription, plan: "elite" }, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(billingLimits(access)).toEqual({ stores: 40, listings: 20_000 });
  });
});

describe("past_due grace", () => {
  const periodStart = new Date("2026-10-10T12:00:00Z");
  const periodEnd = new Date("2026-11-10T12:00:00Z");

  it("ends the paid access the configured days after the failed renewal", () => {
    expect(pastDueAccessEnd({ periodStart, periodEnd }, 7)).toEqual(
      new Date("2026-10-17T12:00:00Z"),
    );
  });

  it("never extends access past the paid period", () => {
    expect(pastDueAccessEnd({ periodStart, periodEnd }, 60)).toEqual(periodEnd);
  });

  it("ends at once with no grace", () => {
    expect(pastDueAccessEnd({ periodStart, periodEnd }, 0)).toEqual(periodStart);
  });
});

describe("billing notice", () => {
  const accessUntil = new Date("2026-12-17T12:00:00Z");
  const pastDue = { plan: "pro", status: "past_due", periodEnd: accessUntil };

  it("warns while the past_due grace runs", () => {
    const notice = billingNotice(
      { subscription: pastDue, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(notice).toEqual({ kind: "past_due", accessUntil });
  });

  it("says the payment failed once the grace is over", () => {
    const notice = billingNotice(
      { subscription: pastDue, tenantCreatedAt: newTenant, transition },
      accessUntil,
    );
    expect(notice).toEqual({ kind: "payment_failed" });
  });

  it("stays quiet for a paid plan", () => {
    const notice = billingNotice({ subscription, tenantCreatedAt: newTenant, transition }, now);
    expect(notice).toBeNull();
  });

  it("asks an account without a plan to choose one", () => {
    const notice = billingNotice(
      { subscription: null, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(notice).toEqual({ kind: "no_plan" });
  });

  it("asks a canceled account to choose a plan again", () => {
    const canceled = { ...subscription, status: "canceled" };
    const notice = billingNotice(
      { subscription: canceled, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(notice).toEqual({ kind: "no_plan" });
  });

  it("tells an account from before the launch when the transition ends", () => {
    const notice = billingNotice(
      { subscription: null, tenantCreatedAt: existingTenant, transition },
      now,
    );
    expect(notice).toEqual({ kind: "transition", until: transition.endsAt, endingSoon: false });
  });

  it("warns in the last seven days of the transition", () => {
    const sevenDaysBefore = new Date("2026-12-24T12:00:00Z");
    const notice = billingNotice(
      { subscription: null, tenantCreatedAt: existingTenant, transition },
      sevenDaysBefore,
    );
    expect(notice).toEqual({ kind: "transition", until: transition.endsAt, endingSoon: true });
  });
});
