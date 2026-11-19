import { billingPlan } from "@sellbridge/shared/billing";
import { describe, expect, it } from "vitest";
import { overLimitWarning, planAllowance, recommendedPlan } from "./plan-choice";

describe("recommended plan", () => {
  it("indicates Start for an account that uses nothing yet", () => {
    expect(recommendedPlan({ stores: 0, listings: 0 }).id).toBe("start");
  });

  it("indicates the smallest plan that holds what the account uses", () => {
    expect(recommendedPlan({ stores: 4, listings: 200 }).id).toBe("pro");
    expect(recommendedPlan({ stores: 2, listings: 2_500 }).id).toBe("business");
  });

  it("indicates the plan that holds exactly the limit", () => {
    expect(recommendedPlan({ stores: 3, listings: 300 }).id).toBe("start");
  });

  it("indicates Elite when even Elite is smaller than the account", () => {
    expect(recommendedPlan({ stores: 90, listings: 10 }).id).toBe("elite");
  });
});

describe("over-limit warning", () => {
  it("says the stores stay but no new one fits", () => {
    expect(overLimitWarning(billingPlan("pro"), { stores: 12, listings: 10 })).toBe(
      "Você tem 12 lojas; o Pro permite 5. As atuais continuam, mas não dá para conectar novas.",
    );
  });

  it("says the listings stay but no new one fits", () => {
    expect(overLimitWarning(billingPlan("start"), { stores: 1, listings: 1_200 })).toBe(
      "Você tem 1.200 anúncios; o Start permite 300. Os atuais continuam, mas não dá para publicar novos.",
    );
  });

  it("stays quiet when the plan holds everything", () => {
    expect(overLimitWarning(billingPlan("start"), { stores: 3, listings: 300 })).toBeNull();
  });
});

describe("plan allowance", () => {
  it("writes the limits with thousands separators", () => {
    expect(planAllowance(billingPlan("elite"))).toEqual({
      stores: "40 lojas conectadas",
      listings: "20.000 anúncios",
    });
  });
});
