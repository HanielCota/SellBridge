import { beforeEach, describe, expect, it, vi } from "vitest";

interface SessionShape {
  user: { id: string; role: string };
  session: { activeOrganizationId: string | null };
}

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<SessionShape | null>>(),
  setActiveOrganization: vi.fn<() => Promise<void>>(),
  isMemberOf: vi.fn<(userId: string, organizationId: string) => Promise<boolean>>(),
  findFirstOrganizationId: vi.fn<(userId: string) => Promise<string | null>>(),
}));
vi.mock("./auth.ts", () => ({
  auth: {
    api: { getSession: mocks.getSession, setActiveOrganization: mocks.setActiveOrganization },
  },
}));
vi.mock("./membership.ts", () => ({
  isMemberOf: mocks.isMemberOf,
  findFirstOrganizationId: mocks.findFirstOrganizationId,
}));

const { requireTenantSession } = await import("./tenant-session");

const session = (activeOrganizationId: string | null): SessionShape => ({
  user: { id: "user-1", role: "user" },
  session: { activeOrganizationId },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.setActiveOrganization.mockResolvedValue(undefined);
});

describe("requireTenantSession", () => {
  it("serves the active organization while the user is still a member", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.isMemberOf.mockResolvedValue(true);
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({ tenantId: "org-a" });
  });

  it("drops an organization the user was removed from, even with a live session", async () => {
    mocks.getSession.mockResolvedValue(session("org-removed"));
    mocks.isMemberOf.mockResolvedValue(false);
    mocks.findFirstOrganizationId.mockResolvedValue("org-own");
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({
      tenantId: "org-own",
    });
  });

  it("refuses a removed member with no organization left", async () => {
    mocks.getSession.mockResolvedValue(session("org-removed"));
    mocks.isMemberOf.mockResolvedValue(false);
    mocks.findFirstOrganizationId.mockResolvedValue(null);
    await expect(requireTenantSession(new Headers())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
