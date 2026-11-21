import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customer: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  record: vi.fn<(executor: unknown, event: unknown) => Promise<void>>(),
  grant: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  revoke: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  getCustomer: mocks.customer,
  recordAdminEvent: mocks.record,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/features/billing/courtesy.server", () => ({
  grantCourtesy: mocks.grant,
  revokeCourtesy: mocks.revoke,
}));

import { conflictError } from "@sellbridge/shared/errors";
import { grantCustomerCourtesy, revokeCustomerCourtesy } from "./customer-courtesy.server";

const NOW = new Date("2026-12-10T15:00:00Z");
const input = {
  userId: "user-a",
  plan: "elite" as const,
  lastDay: "2027-02-28",
  reason: "Conta do cliente dono do projeto",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customer.mockResolvedValue({ id: "user-a", tenantId: "tenant-a" });
  mocks.grant.mockResolvedValue({ previous: null, renewalStopped: false });
  mocks.revoke.mockResolvedValue({ plan: "elite", expiresAt: null, reason: "old" });
});

describe("granting a courtesy plan from the admin", () => {
  it("lasts through the whole last day in Brasília", async () => {
    await grantCustomerCourtesy("admin-a", input, NOW);

    expect(mocks.grant).toHaveBeenCalledWith(
      {
        tenantId: "tenant-a",
        plan: "elite",
        expiresAt: new Date("2027-03-01T03:00:00Z"),
        reason: "Conta do cliente dono do projeto",
        adminId: "admin-a",
      },
      NOW,
    );
  });

  it("writes who gave which plan, until when and why to the team's trail", async () => {
    await grantCustomerCourtesy("admin-a", input, NOW);

    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), {
      adminId: "admin-a",
      userId: "user-a",
      action: "courtesy_granted",
      details: {
        plan: "elite",
        expiresAt: "2027-03-01T03:00:00.000Z",
        reason: "Conta do cliente dono do projeto",
        renewalStopped: false,
        previousPlan: null,
      },
    });
  });

  it("records a change, with the plan it replaced, when one was in force", async () => {
    mocks.grant.mockResolvedValue({
      previous: { plan: "start", expiresAt: null },
      renewalStopped: false,
    });

    await grantCustomerCourtesy("admin-a", { ...input, lastDay: null }, NOW);

    expect(mocks.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "courtesy_changed",
        details: expect.objectContaining({ previousPlan: "start", expiresAt: null }),
      }),
    );
  });

  it("records a new grant when the earlier courtesy was already over", async () => {
    mocks.grant.mockResolvedValue({
      previous: { plan: "start", expiresAt: new Date("2026-12-01T03:00:00Z") },
      renewalStopped: false,
    });

    await grantCustomerCourtesy("admin-a", input, NOW);

    expect(mocks.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "courtesy_granted" }),
    );
  });

  it("says in the trail that the paid subscription stopped renewing", async () => {
    mocks.grant.mockResolvedValue({ previous: null, renewalStopped: true });

    const result = await grantCustomerCourtesy("admin-a", input, NOW);

    expect(result).toEqual({ ok: true, renewalStopped: true });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ details: expect.objectContaining({ renewalStopped: true }) }),
    );
  });

  it("records nothing when the plan could not be given", async () => {
    mocks.grant.mockRejectedValue(conflictError("Asaas fora"));

    await expect(grantCustomerCourtesy("admin-a", input, NOW)).rejects.toThrow("Asaas fora");
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("refuses an account with no reseller profile", async () => {
    mocks.customer.mockResolvedValue({ id: "user-a", tenantId: null });

    const attempt = grantCustomerCourtesy("admin-a", input, NOW);

    await expect(attempt).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("refuses a day that does not exist", async () => {
    const attempt = grantCustomerCourtesy("admin-a", { ...input, lastDay: "2027-02-30" }, NOW);

    await expect(attempt).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.grant).not.toHaveBeenCalled();
  });
});

describe("taking a courtesy plan back from the admin", () => {
  it("writes the plan taken and the reason to the team's trail", async () => {
    await revokeCustomerCourtesy("admin-a", { userId: "user-a", reason: "Passou a pagar" });

    expect(mocks.revoke).toHaveBeenCalledWith("tenant-a");
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), {
      adminId: "admin-a",
      userId: "user-a",
      action: "courtesy_revoked",
      details: { plan: "elite", reason: "Passou a pagar" },
    });
  });
});
