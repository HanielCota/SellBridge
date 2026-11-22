import { BILLING_PLANS, billingPlan } from "@sellbridge/shared/billing";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/billing/billing.queries", () => ({ billingQueryOptions: () => ({}) }));

import type { BillingData } from "./billing-data";
import { planCardState } from "./plan-card-state";

/** An Elite month still paid after the courtesy stopped its renewal: Elite sets the limits. */
function paidEliteWithStartCourtesy(): BillingData {
  return {
    access: {
      kind: "plan",
      planId: "elite",
      source: "subscription",
      limits: { stores: 40, listings: 20_000 },
    },
    courtesy: { planId: "start", expiresAt: "2027-03-01T03:00:00.000Z" },
    subscription: {
      status: "active",
      plan: "elite",
      periodEnd: "2026-12-20T03:00:00.000Z",
      cancelAtPeriodEnd: true,
      paymentMethod: "pix",
      scheduledPlan: null,
      scheduledPlanAt: null,
      upgradePlan: null,
      hasSubscription: true,
    },
    enabled: true,
    canManage: true,
    notice: null,
    usage: { stores: 2, listings: 12 },
    plans: BILLING_PLANS,
    prices: [],
  };
}

describe("plan cards of a courtesy account", () => {
  it("offers no subscription while a larger paid month still sets the limits", () => {
    const data = paidEliteWithStartCourtesy();

    const others = BILLING_PLANS.filter((plan) => plan.id !== "elite");

    const states = others.map((plan) => planCardState(plan, data, false));

    expect(states).toEqual(others.map(() => ({ kind: "courtesy" })));
    expect(planCardState(billingPlan("elite"), data, true)).toEqual({ kind: "in_use" });
  });

  it("offers a subscription again once the courtesy is gone", () => {
    const data = { ...paidEliteWithStartCourtesy(), courtesy: null };

    const state = planCardState(billingPlan("pro"), data, false);

    expect(state).toEqual({ kind: "button", label: "Assinar o Pro", reason: null });
  });
});
