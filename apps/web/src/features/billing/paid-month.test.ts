import { billingPlan } from "@sellbridge/shared/billing";
import { describe, expect, it } from "vitest";
import { paidMonthCarriedTo } from "./paid-month";

const NOW = new Date("2026-11-20T12:00:00Z");
const PAID_UNTIL = new Date("2026-12-10T03:00:00Z");
const startPaid = { plan: "start", status: "active", periodEnd: PAID_UNTIL };

describe("paidMonthCarriedTo", () => {
  it.each(["start", "pro"] as const)(
    "carries a paid Start month over to %s only when it costs no more",
    (plan) => {
      const carried = paidMonthCarriedTo(startPaid, billingPlan(plan), NOW);

      expect(carried).toEqual(plan === "start" ? PAID_UNTIL : null);
    },
  );

  it("carries a paid Elite month over to a smaller plan", () => {
    const elite = { ...startPaid, plan: "elite" };

    expect(paidMonthCarriedTo(elite, billingPlan("pro"), NOW)).toEqual(PAID_UNTIL);
  });

  it("never carries the late-payment grace over, even to the same plan", () => {
    const late = { ...startPaid, status: "past_due" };

    expect(paidMonthCarriedTo(late, billingPlan("start"), NOW)).toBeNull();
  });

  it.each([
    ["a month that is over", { ...startPaid, periodEnd: new Date("2026-11-20T11:00:00Z") }],
    ["an account without a period", { ...startPaid, periodEnd: null }],
    ["an unknown former plan", { ...startPaid, plan: "free" }],
    ["no account", null],
  ])("carries nothing for %s", (_label, account) => {
    expect(paidMonthCarriedTo(account, billingPlan("start"), NOW)).toBeNull();
  });
});
