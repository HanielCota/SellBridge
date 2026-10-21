import { describe, expect, it } from "vitest";
import { billingNotice, effectiveBillingPlan, pastDueAccessEnd } from "./billing.ts";
const now = new Date("2026-10-12T12:00:00Z");
const subscription = { plan: "pro", status: "active", periodEnd: new Date("2026-11-12T12:00:00Z") };
describe("billing entitlements", () => {
  it("defaults existing organizations to the free plan", () => {
    expect(effectiveBillingPlan(null, now).id).toBe("free");
  });
  it.each(["active", "trialing"])("grants paid limits for %s within the period", (status) => {
    expect(effectiveBillingPlan({ ...subscription, status }, now).listings).toBe(500);
  });
  // Regression (item 16, N9): a failed renewal dropped the reseller to Gratuito at once.
  it("keeps paid limits for past_due until the grace period ends", () => {
    const graceEnd = new Date("2026-10-15T12:00:00Z");
    const pastDue = { ...subscription, status: "past_due", periodEnd: graceEnd };
    expect(effectiveBillingPlan(pastDue, now).id).toBe("pro");
    expect(effectiveBillingPlan(pastDue, graceEnd).id).toBe("free");
  });
  it.each(["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"])(
    "revokes paid limits for %s",
    (status) => {
      expect(effectiveBillingPlan({ ...subscription, status }, now).id).toBe("free");
    },
  );
  it("revokes an expired subscription even without a cancellation webhook", () => {
    expect(effectiveBillingPlan({ ...subscription, periodEnd: now }, now).id).toBe("free");
    expect(effectiveBillingPlan({ ...subscription, periodEnd: null }, now).id).toBe("free");
  });
  it("does not grant limits to an unknown price/plan", () => {
    expect(effectiveBillingPlan({ ...subscription, plan: "unrecognized" }, now).id).toBe("free");
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
  it("warns while the grace runs and stays quiet otherwise", () => {
    const accessUntil = new Date("2026-10-17T12:00:00Z");
    const pastDue = { plan: "pro", status: "past_due", periodEnd: accessUntil };
    expect(billingNotice(pastDue, now)).toEqual({ kind: "past_due", accessUntil });
    expect(billingNotice({ ...pastDue, status: "active" }, now)).toBeNull();
    expect(billingNotice(pastDue, accessUntil)).toEqual({ kind: "payment_failed" });
    expect(billingNotice(null, now)).toBeNull();
  });
});
