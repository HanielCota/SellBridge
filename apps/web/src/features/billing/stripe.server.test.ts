import { beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({
  STRIPE_SECRET_KEY: "sk_test_x" as string | undefined,
  STRIPE_WEBHOOK_SECRET: "whsec_x" as string | undefined,
  STRIPE_PRO_PRICE_ID: "price_pro" as string | undefined,
  STRIPE_BUSINESS_PRICE_ID: "price_business" as string | undefined,
  STRIPE_START_PRICE_ID: undefined as string | undefined,
  STRIPE_BLACK_PRICE_ID: undefined as string | undefined,
  STRIPE_ELITE_PRICE_ID: undefined as string | undefined,
  PLAN_MATRIX_ENABLED: false,
}));
vi.mock("@/lib/server/environment", () => ({ environment }));

const { activePlans, billingConfigured, planOfPrice, priceId } = await import("./stripe.server");

beforeEach(() => {
  environment.PLAN_MATRIX_ENABLED = false;
  environment.STRIPE_START_PRICE_ID = undefined;
  environment.STRIPE_BLACK_PRICE_ID = undefined;
  environment.STRIPE_ELITE_PRICE_ID = undefined;
});

// Item 31.a (M1, D10): the plans and their Stripe prices follow PLAN_MATRIX_ENABLED.
describe("plan prices", () => {
  it("sells today's two paid plans while the matrix is off", () => {
    expect(activePlans().map((plan) => plan.id)).toEqual(["free", "pro", "business"]);
    expect(billingConfigured()).toBe(true);
    expect(planOfPrice("price_business")).toBe("business");
    expect(planOfPrice("price_unknown")).toBe("free");
  });

  it("needs a price for each of the PDF's plans before selling them", () => {
    environment.PLAN_MATRIX_ENABLED = true;
    expect(billingConfigured()).toBe(false);
    environment.STRIPE_START_PRICE_ID = "price_start";
    environment.STRIPE_BLACK_PRICE_ID = "price_black";
    environment.STRIPE_ELITE_PRICE_ID = "price_elite";
    expect(billingConfigured()).toBe(true);
    expect(planOfPrice("price_black")).toBe("black");
    expect(priceId("elite")).toBe("price_elite");
  });

  it("refuses a plan outside the catalog in force", () => {
    environment.STRIPE_BLACK_PRICE_ID = "price_black";
    expect(() => priceId("black")).toThrow(expect.objectContaining({ code: "VALIDATION" }));
    expect(planOfPrice("price_black")).toBe("free");
  });
});
