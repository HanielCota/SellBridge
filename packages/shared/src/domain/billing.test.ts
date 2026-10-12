import { describe, expect, it } from "vitest";
import { effectiveBillingPlan } from "./billing.ts";
const now = new Date("2026-10-12T12:00:00Z");
const subscription = { plan: "pro", status: "active", periodEnd: new Date("2026-11-12T12:00:00Z") };
describe("billing entitlements", () => {
  it("defaults existing organizations to the free plan", () => {
    expect(effectiveBillingPlan(null, now).id).toBe("free");
  });
  it.each(["active", "trialing"])("grants paid limits for %s within the period", (status) => {
    expect(effectiveBillingPlan({ ...subscription, status }, now).listings).toBe(500);
  });
  it.each(["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"])(
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
