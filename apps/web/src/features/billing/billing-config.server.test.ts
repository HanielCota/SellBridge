import { beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => {
  const holder: { value: Record<string, unknown> } = { value: {} };
  return holder;
});
vi.mock("@/lib/server/environment", () => ({
  get environment() {
    return environment.value;
  },
}));

const { billingEnabled, billingRules } = await import("./billing-config.server");

const ASAAS = {
  ASAAS_API_KEY: "$aact_prod_x",
  ASAAS_WALLET_ID: "wallet_x",
  ASAAS_WEBHOOK_TOKEN: "t".repeat(40),
};
const DATES = {
  BILLING_LAUNCHED_AT: "2026-12-01T03:00:00Z",
  BILLING_TRANSITION_ENDS_AT: "2026-12-31T03:00:00Z",
};

/** What the environment schema always fills in. */
const DEFAULTS = { ASAAS_API_URL: "https://api.asaas.com/v3" };

beforeEach(() => {
  environment.value = { ...DEFAULTS };
});

describe("billingEnabled", () => {
  it("charges the plans once the Asaas account and both launch dates are set", () => {
    environment.value = { ...DEFAULTS, ...ASAAS, ...DATES, BILLING_UNLIMITED: false };

    expect(billingEnabled()).toBe(true);
    expect(billingRules()).toEqual({
      transition: {
        launchedAt: new Date(DATES.BILLING_LAUNCHED_AT),
        endsAt: new Date(DATES.BILLING_TRANSITION_ENDS_AT),
      },
    });
  });

  it("keeps every limit off with BILLING_UNLIMITED, even with Asaas and the dates set", () => {
    environment.value = { ...DEFAULTS, ...ASAAS, ...DATES, BILLING_UNLIMITED: true };

    expect(billingEnabled()).toBe(false);
    expect(billingRules()).toBeNull();
  });

  it.each([
    ["without the Asaas account", { ...DATES }],
    ["without the launch dates", { ...ASAAS }],
  ])("keeps the plans off %s", (_label, values) => {
    environment.value = { ...DEFAULTS, ...values, BILLING_UNLIMITED: false };

    expect(billingEnabled()).toBe(false);
    expect(billingRules()).toBeNull();
  });
});
