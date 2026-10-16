import { describe, expect, it } from "vitest";
import { effectiveBillingPlan } from "./billing.ts";
import { paidPlanIds, planAllows, planCatalog, requirePlanFeature } from "./billing-plans.ts";

const now = new Date("2026-10-12T12:00:00Z");
const active = { status: "active", periodEnd: new Date("2026-11-12T12:00:00Z") };

// Item 31.a (M1, D10): the PDF's five plans behind a flag, the three current ones by default.
describe("plan catalogs", () => {
  it("keeps today's three plans while the matrix is off", () => {
    expect(planCatalog(false).map((plan) => plan.id)).toEqual(["free", "pro", "business"]);
    expect(paidPlanIds(false)).toEqual(["pro", "business"]);
  });

  it("offers the PDF's five paid plans with the matrix on, Gratuito only as the fallback", () => {
    expect(paidPlanIds(true)).toEqual(["start", "pro", "business", "black", "elite"]);
    expect(planCatalog(true).map((plan) => plan.referencePriceCents)).toEqual([
      0, 9_700, 19_700, 39_700, 69_700, 99_700,
    ]);
  });

  it("reads the plan of a subscription from the catalog in force", () => {
    const pdf = planCatalog(true);
    expect(effectiveBillingPlan({ ...active, plan: "black" }, now, pdf).id).toBe("black");
    expect(effectiveBillingPlan({ ...active, plan: "black" }, now).id).toBe("free");
    expect(effectiveBillingPlan(null, now, pdf).id).toBe("free");
  });

  it("grows every limit from one PDF plan to the next", () => {
    const paid = planCatalog(true).slice(1);
    for (const [index, plan] of paid.entries()) {
      const next = paid[index + 1];
      if (next === undefined) continue;
      expect(next.stores).toBeGreaterThanOrEqual(plan.stores);
      expect(next.listings).toBeGreaterThan(plan.listings);
    }
  });
});

describe("plan features", () => {
  it("releases everything on today's plans", () => {
    for (const plan of planCatalog(false)) {
      expect(planAllows(plan, "fiscal")).toBe(true);
      expect(planAllows(plan, "ai_assistant")).toBe(true);
    }
  });

  it("releases a feature only from the plan that includes it, on the server too", () => {
    const [free, start, , , black] = planCatalog(true);
    if (free === undefined || start === undefined || black === undefined) throw new Error("plans");
    expect(planAllows(start, "ai_assistant")).toBe(false);
    expect(planAllows(black, "ai_assistant")).toBe(true);
    expect(() => requirePlanFeature(start, "ai_assistant")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => requirePlanFeature(black, "ai_assistant")).not.toThrow();
  });
});
