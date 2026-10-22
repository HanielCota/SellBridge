import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * What the flags page's server functions run before anything else: `staffMiddleware` hands the
 * request to `requireStaffSession` with `suppliers.view_flags` (read) or `suppliers.flag`
 * (apply, revoke). Sellers, suppliers and anonymous callers never get past it.
 */
const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ user: { id: string; role: string } } | null>>(),
}));
vi.mock("@/lib/server/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/server/membership", () => ({ listMemberships: async () => [] }));

const { requireStaffSession } = await import("@/lib/server/tenant-session");

function signedInAs(role: string): void {
  mocks.getSession.mockResolvedValue({ user: { id: `${role}-1`, role } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("supplier flags on the server", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireStaffSession(new Headers(), "suppliers.view_flags")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses sellers and suppliers, who are not on the team", async () => {
    signedInAs("user");
    await expect(requireStaffSession(new Headers(), "suppliers.view_flags")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(requireStaffSession(new Headers(), "suppliers.flag")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lets an agent read the flags but refuses an agent applying or revoking one", async () => {
    signedInAs("agent");
    await expect(requireStaffSession(new Headers(), "suppliers.view_flags")).resolves.toEqual({
      userId: "agent-1",
      role: "agent",
    });
    await expect(requireStaffSession(new Headers(), "suppliers.flag")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lets a supervisor apply and revoke", async () => {
    signedInAs("supervisor");
    await expect(requireStaffSession(new Headers(), "suppliers.flag")).resolves.toEqual({
      userId: "supervisor-1",
      role: "supervisor",
    });
  });
});
