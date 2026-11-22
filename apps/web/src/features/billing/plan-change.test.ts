import { billingPlan } from "@sellbridge/shared/billing";
import { describe, expect, it } from "vitest";
import { planChangeOf } from "./plan-change";

const paidPeriod = {
  start: new Date("2026-11-19T03:00:00Z"),
  end: new Date("2026-12-19T03:00:00Z"),
};
const middle = new Date("2026-12-04T03:00:00Z");

describe("plan change", () => {
  it("keeps the plan in force when nothing is scheduled", () => {
    const change = planChangeOf({
      current: billingPlan("pro"),
      target: billingPlan("pro"),
      scheduledPlan: null,
      paidPeriod,
      now: middle,
    });

    expect(change).toEqual({ kind: "keep" });
  });

  it("drops a scheduled smaller plan when the current one is chosen again", () => {
    const change = planChangeOf({
      current: billingPlan("elite"),
      target: billingPlan("elite"),
      scheduledPlan: "pro",
      paidPeriod,
      now: middle,
    });

    expect(change).toEqual({ kind: "cancel_schedule" });
  });

  it("schedules a smaller plan for the next monthly charge", () => {
    const change = planChangeOf({
      current: billingPlan("elite"),
      target: billingPlan("pro"),
      scheduledPlan: null,
      paidPeriod,
      now: middle,
    });

    expect(change).toEqual({ kind: "schedule", startsAt: paidPeriod.end });
  });

  it("charges the difference for the rest of the month to move up", () => {
    const change = planChangeOf({
      current: billingPlan("pro"),
      target: billingPlan("elite"),
      scheduledPlan: null,
      paidPeriod,
      now: middle,
    });

    expect(change).toEqual({ kind: "upgrade_pay", differenceCents: 40_000, until: paidPeriod.end });
  });

  it("moves up at no charge when the difference is below the payment minimum", () => {
    const change = planChangeOf({
      current: billingPlan("start"),
      target: billingPlan("pro"),
      scheduledPlan: null,
      paidPeriod,
      now: new Date("2026-12-18T12:00:00Z"),
    });

    expect(change).toEqual({ kind: "upgrade_now" });
  });

  it("refuses a change before the first month is paid", () => {
    expect(() =>
      planChangeOf({
        current: billingPlan("start"),
        target: billingPlan("pro"),
        scheduledPlan: null,
        paidPeriod: null,
        now: middle,
      }),
    ).toThrow(expect.objectContaining({ code: "CONFLICT" }));
  });
});
