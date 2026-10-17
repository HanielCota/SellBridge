import { beforeEach, describe, expect, it, vi } from "vitest";

interface SessionShape {
  user: { id: string; role: string };
  session: {
    activeOrganizationId: string | null;
    impersonatedBy?: string | null;
    createdAt?: Date;
  };
}

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<SessionShape | null>>(),
  setActiveOrganization: vi.fn<() => Promise<void>>(),
  findMemberProfileKind:
    vi.fn<(userId: string, organizationId: string) => Promise<"seller" | "supplier" | null>>(),
  findFirstOrganizationId: vi.fn<(userId: string) => Promise<string | null>>(),
}));
vi.mock("./auth.ts", () => ({
  auth: {
    api: { getSession: mocks.getSession, setActiveOrganization: mocks.setActiveOrganization },
  },
}));
vi.mock("./membership.ts", () => ({
  findMemberProfileKind: mocks.findMemberProfileKind,
  findFirstOrganizationId: mocks.findFirstOrganizationId,
}));

const { requireSellerSession, requireTenantSession } = await import("./tenant-session");

const startedAt = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

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
    mocks.findMemberProfileKind.mockResolvedValue("seller");
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({
      tenantId: "org-a",
      profileKind: "seller",
    });
  });

  it("tells which kind of profile the session is on", async () => {
    mocks.getSession.mockResolvedValue(session("org-supplier"));
    mocks.findMemberProfileKind.mockResolvedValue("supplier");
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({
      tenantId: "org-supplier",
      profileKind: "supplier",
    });
  });

  it("drops an organization the user was removed from, even with a live session", async () => {
    mocks.getSession.mockResolvedValue(session("org-removed"));
    mocks.findMemberProfileKind.mockImplementation(async (_userId, organizationId) =>
      organizationId === "org-own" ? "seller" : null,
    );
    mocks.findFirstOrganizationId.mockResolvedValue("org-own");
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({
      tenantId: "org-own",
    });
  });

  it("refuses a removed member with no organization left", async () => {
    mocks.getSession.mockResolvedValue(session("org-removed"));
    mocks.findMemberProfileKind.mockResolvedValue(null);
    mocks.findFirstOrganizationId.mockResolvedValue(null);
    await expect(requireTenantSession(new Headers())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ends an admin's visit after an hour, whatever the session cookie says", async () => {
    mocks.findMemberProfileKind.mockResolvedValue("seller");
    mocks.getSession.mockResolvedValue({
      ...session("org-a"),
      session: {
        activeOrganizationId: "org-a",
        impersonatedBy: "admin-1",
        createdAt: startedAt(59),
      },
    });
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({
      impersonatedBy: "admin-1",
    });
    mocks.getSession.mockResolvedValue({
      ...session("org-a"),
      session: {
        activeOrganizationId: "org-a",
        impersonatedBy: "admin-1",
        createdAt: startedAt(61),
      },
    });
    await expect(requireTenantSession(new Headers())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("requireSellerSession", () => {
  it("refuses seller functions to a supplier profile with 403", async () => {
    mocks.getSession.mockResolvedValue(session("org-supplier"));
    mocks.findMemberProfileKind.mockResolvedValue("supplier");
    await expect(requireSellerSession(new Headers())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serves a seller profile", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.findMemberProfileKind.mockResolvedValue("seller");
    await expect(requireSellerSession(new Headers())).resolves.toMatchObject({ tenantId: "org-a" });
  });
});
