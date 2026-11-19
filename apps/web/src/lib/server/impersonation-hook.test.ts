import { problemsLoggedBy } from "@sellbridge/shared/problem-capture-testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordAdminEvent: vi.fn<(database: unknown, input: unknown) => Promise<void>>(),
}));
vi.mock("./database.ts", () => ({
  database: { query: { user: { findFirst: async () => ({ role: "admin" }) } } },
}));
vi.mock("@sellbridge/database/repositories", () => ({
  recordAdminEvent: mocks.recordAdminEvent,
  findImpersonationTarget: async () => ({ openTicketId: null, profileKind: "seller" }),
}));

const { recordVisitStart } = await import("./impersonation-hook");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

describe("visit start", () => {
  it("records the team entering a customer's account before the session opens", async () => {
    await recordVisitStart({ userId: "customer-1" }, "admin-1");

    expect(mocks.recordAdminEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ adminId: "admin-1", userId: "customer-1", action: "impersonated" }),
    );
  });

  it("refuses the visit when the entry cannot be recorded, and tells the team", async () => {
    mocks.recordAdminEvent.mockRejectedValueOnce(new Error("connection refused"));

    const problems = await problemsLoggedBy(async () => {
      await expect(recordVisitStart({ userId: "customer-1" }, "admin-1")).rejects.toMatchObject({
        message: expect.stringContaining("Não deu para registrar a sua entrada"),
      });
    }, "web");

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ event: "admin.audit_record_failed" });
  });

  it("records nothing for a person's own sign-in", async () => {
    await recordVisitStart({ userId: "customer-1" }, null);

    expect(mocks.recordAdminEvent).not.toHaveBeenCalled();
  });
});
