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
  listMemberships: vi.fn<(userId: string) => Promise<{ organizationId: string; slug: string }[]>>(),
}));
vi.mock("./auth.ts", () => ({
  auth: {
    api: { getSession: mocks.getSession, setActiveOrganization: mocks.setActiveOrganization },
  },
}));
vi.mock("./membership.ts", () => ({
  listMemberships: mocks.listMemberships,
}));

const { requireTenantSession } = await import("./tenant-session");

const membership = (organizationId: string) => ({ organizationId, slug: `loja-${organizationId}` });

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
    mocks.listMemberships.mockResolvedValue([membership("org-a")]);
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({ tenantId: "org-a" });
  });

  it("drops an organization the user was removed from, even with a live session", async () => {
    mocks.getSession.mockResolvedValue(session("org-removed"));
    mocks.listMemberships.mockResolvedValue([membership("org-own")]);
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({
      tenantId: "org-own",
    });
  });

  it("refuses a removed member with no organization left", async () => {
    mocks.getSession.mockResolvedValue(session("org-removed"));
    mocks.listMemberships.mockResolvedValue([]);
    await expect(requireTenantSession(new Headers())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ends an admin's visit after an hour, whatever the session cookie says", async () => {
    mocks.listMemberships.mockResolvedValue([membership("org-a")]);
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

  it("uses the profile sent by the tab instead of the session's active one", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.listMemberships.mockResolvedValue([membership("org-a"), membership("org-b")]);
    await expect(requireTenantSession(new Headers(), "loja-org-b")).resolves.toMatchObject({
      tenantId: "org-b",
    });
  });

  it("refuses a profile the user is not a member of", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.listMemberships.mockResolvedValue([membership("org-a")]);
    await expect(requireTenantSession(new Headers(), "loja-org-x")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("loja-org-x"),
    });
  });

  it("falls back to the session's active profile when the tab sends none", async () => {
    mocks.getSession.mockResolvedValue(session("org-b"));
    mocks.listMemberships.mockResolvedValue([membership("org-a"), membership("org-b")]);
    await expect(requireTenantSession(new Headers(), null)).resolves.toMatchObject({
      tenantId: "org-b",
    });
  });

  it("does not change the session's active profile when a tab reads another one", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.listMemberships.mockResolvedValue([membership("org-a"), membership("org-b")]);
    await requireTenantSession(new Headers(), "loja-org-b");
    expect(mocks.setActiveOrganization).not.toHaveBeenCalled();
  });

  it("reads the profile from the tab's header when no profile is passed", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.listMemberships.mockResolvedValue([membership("org-a"), membership("org-b")]);
    const headers = new Headers({ "x-sellbridge-profile": "loja-org-b" });
    await expect(requireTenantSession(headers)).resolves.toMatchObject({ tenantId: "org-b" });
  });
});
