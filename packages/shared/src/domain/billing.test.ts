import { describe, expect, it } from "vitest";
import {
  BILLING_PLAN_IDS,
  BILLING_PLANS,
  billingAccess,
  billingLimits,
  billingNotice,
  courtesyBillingPlan,
  paidBillingPlan,
  upgradeDifferenceCents,
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
      { subscription, courtesy: null, tenantCreatedAt: existingTenant, transition },
      now,
    );
    expect(access).toMatchObject({ kind: "plan", plan: { id: "pro" } });
  });

  it("keeps an account from before the launch unlimited during the transition", () => {
    const access = billingAccess(
      { subscription: null, courtesy: null, tenantCreatedAt: existingTenant, transition },
      now,
    );
    expect(access).toEqual({ kind: "transition", until: transition.endsAt });
    expect(billingLimits(access)).toBeNull();
  });

  it("gives an account created after the launch no free period", () => {
    const access = billingAccess(
      { subscription: null, courtesy: null, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(access).toEqual({ kind: "none" });
  });

  it("ends the transition on its last moment", () => {
    const access = billingAccess(
      { subscription: null, courtesy: null, tenantCreatedAt: existingTenant, transition },
      transition.endsAt,
    );
    expect(access).toEqual({ kind: "none" });
  });

  it("has no transition when none is configured", () => {
    const access = billingAccess(
      { subscription: null, courtesy: null, tenantCreatedAt: existingTenant, transition: null },
      now,
    );
    expect(access).toEqual({ kind: "none" });
  });

  it("lets an account without a plan add no store and no listing", () => {
    expect(billingLimits({ kind: "none" })).toEqual({ stores: 0, listings: 0 });
  });

  it("limits a paid account to its plan", () => {
    const access = billingAccess(
      {
        subscription: { ...subscription, plan: "elite" },
        courtesy: null,
        tenantCreatedAt: newTenant,
        transition,
      },
      now,
    );
    expect(billingLimits(access)).toEqual({ stores: 40, listings: 20_000 });
  });
});

describe("billing notice", () => {
  const accessUntil = new Date("2026-12-17T12:00:00Z");
  const pastDue = { plan: "pro", status: "past_due", periodEnd: accessUntil };

  it("warns while the past_due grace runs", () => {
    const notice = billingNotice(
      { subscription: pastDue, courtesy: null, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(notice).toEqual({ kind: "past_due", accessUntil });
  });

  it("says the payment failed once the grace is over", () => {
    const notice = billingNotice(
      { subscription: pastDue, courtesy: null, tenantCreatedAt: newTenant, transition },
      accessUntil,
    );
    expect(notice).toEqual({ kind: "payment_failed" });
  });

  it("stays quiet for a paid plan", () => {
    const notice = billingNotice(
      { subscription, courtesy: null, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(notice).toBeNull();
  });

  it("asks an account without a plan to choose one", () => {
    const notice = billingNotice(
      { subscription: null, courtesy: null, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(notice).toEqual({ kind: "no_plan" });
  });

  it("asks a canceled account to choose a plan again", () => {
    const canceled = { ...subscription, status: "canceled" };
    const notice = billingNotice(
      { subscription: canceled, courtesy: null, tenantCreatedAt: newTenant, transition },
      now,
    );
    expect(notice).toEqual({ kind: "no_plan" });
  });

  it("tells an account from before the launch when the transition ends", () => {
    const notice = billingNotice(
      { subscription: null, courtesy: null, tenantCreatedAt: existingTenant, transition },
      now,
    );
    expect(notice).toEqual({ kind: "transition", until: transition.endsAt, endingSoon: false });
  });

  it("warns in the last seven days of the transition", () => {
    const sevenDaysBefore = new Date("2026-12-24T12:00:00Z");
    const notice = billingNotice(
      { subscription: null, courtesy: null, tenantCreatedAt: existingTenant, transition },
      sevenDaysBefore,
    );
    expect(notice).toEqual({ kind: "transition", until: transition.endsAt, endingSoon: true });
  });
});

describe("courtesy plan", () => {
  const expiresAt = new Date("2027-03-01T03:00:00Z");
  const courtesy = { plan: "elite", expiresAt };
  const base = { subscription: null, courtesy, tenantCreatedAt: newTenant, transition };

  it("gives the plan and its limits with no subscription", () => {
    const access = billingAccess(base, now);

    expect(access).toMatchObject({ kind: "plan", plan: { id: "elite" }, source: "courtesy" });
    expect(billingLimits(access)).toEqual({ stores: 40, listings: 20_000 });
  });

  it("never runs out without an end date", () => {
    const farAhead = new Date("2040-01-01T00:00:00Z");

    const plan = courtesyBillingPlan({ plan: "start", expiresAt: null }, farAhead);

    expect(plan?.id).toBe("start");
  });

  it("ends on its last moment and leaves the account without a plan", () => {
    expect(billingAccess(base, expiresAt)).toEqual({ kind: "none" });
    expect(billingNotice(base, expiresAt)).toEqual({ kind: "no_plan" });
  });

  it("gives nothing for a plan that does not exist", () => {
    expect(courtesyBillingPlan({ plan: "free", expiresAt: null }, now)).toBeNull();
  });

  it("asks the account for no plan and no payment while it lasts", () => {
    const unpaid = { plan: "pro", status: "unpaid", periodEnd: null };

    expect(billingNotice(base, now)).toBeNull();
    expect(billingNotice({ ...base, subscription: unpaid }, now)).toBeNull();
  });

  it("warns from seven days before the end", () => {
    const eightDaysBefore = new Date("2027-02-21T02:59:59Z");
    const sevenDaysBefore = new Date("2027-02-22T03:00:00Z");

    expect(billingNotice(base, eightDaysBefore)).toBeNull();
    expect(billingNotice(base, sevenDaysBefore)).toEqual({
      kind: "courtesy_ending",
      until: expiresAt,
    });
  });

  it("keeps the larger of a month still paid and the courtesy plan", () => {
    const smallerCourtesy = { ...base, subscription: { ...subscription, plan: "elite" } };
    const largerCourtesy = { ...base, subscription };

    expect(
      billingAccess({ ...smallerCourtesy, courtesy: { plan: "start", expiresAt } }, now),
    ).toMatchObject({ plan: { id: "elite" }, source: "subscription" });
    expect(billingAccess(largerCourtesy, now)).toMatchObject({
      plan: { id: "elite" },
      source: "courtesy",
    });
  });

  it("leaves an account from before the launch unlimited, without the transition notice", () => {
    const existing = { ...base, tenantCreatedAt: existingTenant };

    expect(billingAccess(existing, now)).toEqual({ kind: "transition", until: transition.endsAt });
    expect(billingNotice(existing, now)).toBeNull();
    expect(billingAccess(existing, transition.endsAt)).toMatchObject({ source: "courtesy" });
  });
});

describe("scheduled smaller plan", () => {
  const scheduled = {
    ...subscription,
    plan: "elite",
    scheduledPlan: "pro",
    scheduledPlanAt: new Date("2026-12-19T03:00:00Z"),
  };

  it("keeps the current plan until the scheduled day", () => {
    expect(paidBillingPlan(scheduled, now)?.id).toBe("elite");
  });

  it("switches to the smaller plan from the scheduled day on", () => {
    expect(paidBillingPlan(scheduled, new Date("2026-12-19T03:00:00Z"))?.id).toBe("pro");
  });
});

describe("upgrade difference", () => {
  const period = {
    periodStart: new Date("2026-11-19T03:00:00Z"),
    periodEnd: new Date("2026-12-19T03:00:00Z"),
  };

  it("charges the price difference for the share of the month still ahead", () => {
    const difference = upgradeDifferenceCents({
      ...period,
      fromPriceCents: 19_700,
      toPriceCents: 99_700,
      now: new Date("2026-12-04T03:00:00Z"),
    });

    expect(difference).toBe(40_000);
  });

  it("charges the whole difference on the first day of the period", () => {
    const difference = upgradeDifferenceCents({
      ...period,
      fromPriceCents: 9_700,
      toPriceCents: 19_700,
      now: period.periodStart,
    });

    expect(difference).toBe(10_000);
  });

  it("charges nothing once the period is over", () => {
    const difference = upgradeDifferenceCents({
      ...period,
      fromPriceCents: 9_700,
      toPriceCents: 19_700,
      now: new Date("2026-12-20T03:00:00Z"),
    });

    expect(difference).toBe(0);
  });

  it("charges nothing for a cheaper plan", () => {
    const difference = upgradeDifferenceCents({
      ...period,
      fromPriceCents: 99_700,
      toPriceCents: 19_700,
      now: new Date("2026-12-04T03:00:00Z"),
    });

    expect(difference).toBe(0);
  });

  it("throws RangeError for a period that does not move forward", () => {
    expect(() =>
      upgradeDifferenceCents({
        periodStart: period.periodEnd,
        periodEnd: period.periodStart,
        fromPriceCents: 9_700,
        toPriceCents: 19_700,
        now,
      }),
    ).toThrow(RangeError);
  });

  it("throws RangeError for a price that is not whole cents", () => {
    expect(() =>
      upgradeDifferenceCents({ ...period, fromPriceCents: 97.5, toPriceCents: 19_700, now }),
    ).toThrow(RangeError);
  });
});
