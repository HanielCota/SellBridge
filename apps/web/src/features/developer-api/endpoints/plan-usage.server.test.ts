import { BILLING_PLANS } from "@sellbridge/shared/billing";
import { notFoundError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationForDeveloper: vi.fn<() => Promise<unknown>>(),
  findBillingAccess: vi.fn<() => Promise<unknown>>(),
  billingUsage: vi.fn<() => Promise<{ stores: number; listings: number }>>(),
  billingRules: vi.fn<() => unknown>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({ environment: { DEVELOPER_EMAILS: [] } }));
vi.mock("@sellbridge/database/repositories", () => mocks);
vi.mock("@/features/billing/billing-config.server", () => ({ billingRules: mocks.billingRules }));

const { getDeveloperPlanUsage } = await import("./plan-usage.server");

function readPlanUsage() {
  return getDeveloperPlanUsage.handle({
    caller: {
      developerApiKeyId: "key-1",
      createdByUserId: "dev-1",
      name: "Painel",
      prefix: "sb_dev_abcdef",
      scopes: ["organizations:read"],
      expiresAt: new Date("2026-12-25T12:00:00Z"),
    },
    params: { organizationId: "org-1" },
    query: {},
    requestId: "request-1",
    now: new Date("2026-11-25T12:00:00Z"),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrganizationForDeveloper.mockResolvedValue({ id: "org-1" });
  mocks.billingRules.mockReturnValue({ transition: null });
  mocks.findBillingAccess.mockResolvedValue({
    kind: "plan",
    plan: BILLING_PLANS[0],
    source: "subscription",
  });
  mocks.billingUsage.mockResolvedValue({ stores: 1, listings: 120 });
});

describe("getDeveloperPlanUsage", () => {
  it("returns the plan, what it allows, what is used and what is left", async () => {
    const usage = await readPlanUsage();

    expect(usage.data).toEqual({
      situation: "plan",
      plan: { id: "start", name: "Start" },
      allowed: { stores: 3, listings: 300 },
      used: { stores: 1, listings: 120 },
      left: { stores: 2, listings: 180 },
    });
  });

  it("has no limits while billing is off", async () => {
    mocks.billingRules.mockReturnValue(null);

    const usage = await readPlanUsage();

    expect(usage.data).toEqual({
      situation: "unlimited",
      plan: null,
      allowed: null,
      used: { stores: 1, listings: 120 },
      left: null,
    });
    expect(mocks.findBillingAccess).not.toHaveBeenCalled();
  });

  it("leaves nothing without a plan", async () => {
    mocks.findBillingAccess.mockResolvedValue({ kind: "none" });

    const usage = await readPlanUsage();

    expect(usage.data).toMatchObject({ situation: "no_plan", plan: null, left: { listings: 0 } });
  });

  it("refuses an unknown organization", async () => {
    mocks.getOrganizationForDeveloper.mockRejectedValue(
      notFoundError("Organização não encontrada"),
    );

    await expect(readPlanUsage()).rejects.toThrow("Organização não encontrada");
    expect(mocks.billingUsage).not.toHaveBeenCalled();
  });
});
