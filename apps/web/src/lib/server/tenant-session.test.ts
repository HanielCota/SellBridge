import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisitingStaff } from "./impersonation-window.ts";
import type { Membership } from "./membership.ts";

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
  listMemberships: vi.fn<(userId: string) => Promise<Membership[]>>(),
  findVisitingStaff: vi.fn<(userId: string) => Promise<VisitingStaff | null>>(),
}));
vi.mock("./auth.ts", () => ({
  auth: {
    api: { getSession: mocks.getSession, setActiveOrganization: mocks.setActiveOrganization },
  },
}));
vi.mock("./membership.ts", () => ({
  listMemberships: mocks.listMemberships,
}));
vi.mock("./visiting-staff.ts", () => ({
  findVisitingStaff: mocks.findVisitingStaff,
}));

const { requireSellerSession, requireTenantSession } = await import("./tenant-session");

const membership = (organizationId: string, kind: Membership["kind"] = "seller"): Membership => ({
  organizationId,
  slug: `loja-${organizationId}`,
  kind,
});

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
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({
      tenantId: "org-a",
      profileKind: "seller",
    });
  });

  it("tells which kind of profile the session is on", async () => {
    mocks.getSession.mockResolvedValue(session("org-supplier"));
    mocks.listMemberships.mockResolvedValue([membership("org-supplier", "supplier")]);
    await expect(requireTenantSession(new Headers())).resolves.toMatchObject({
      tenantId: "org-supplier",
      profileKind: "supplier",
    });
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
    mocks.findVisitingStaff.mockResolvedValue({ role: "admin", banned: false });
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

  // Regression (security audit, 26/10/2026): the visit session belongs to the customer, so banning
  // or demoting the team member deleted none of it and the visit went on until the hour ended.
  it.each([
    ["banned", { role: "agent", banned: true }],
    ["demoted", { role: "user", banned: false }],
    ["removed", null],
  ] as const)(
    "ends the visit of a team member who was %s since it started",
    async (_case, visitor) => {
      mocks.listMemberships.mockResolvedValue([membership("org-a")]);
      mocks.findVisitingStaff.mockResolvedValue(visitor);
      mocks.getSession.mockResolvedValue({
        ...session("org-a"),
        session: {
          activeOrganizationId: "org-a",
          impersonatedBy: "agent-1",
          createdAt: startedAt(5),
        },
      });
      await expect(requireTenantSession(new Headers())).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      expect(mocks.findVisitingStaff).toHaveBeenCalledWith("agent-1");
    },
  );

  it("does not look up a visitor for the customer's own session", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.listMemberships.mockResolvedValue([membership("org-a")]);
    await requireTenantSession(new Headers());
    expect(mocks.findVisitingStaff).not.toHaveBeenCalled();
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

describe("requireSellerSession", () => {
  it("refuses seller functions to a supplier profile with 403", async () => {
    mocks.getSession.mockResolvedValue(session("org-supplier"));
    mocks.listMemberships.mockResolvedValue([membership("org-supplier", "supplier")]);
    await expect(requireSellerSession(new Headers())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serves a seller profile", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.listMemberships.mockResolvedValue([membership("org-a")]);
    await expect(requireSellerSession(new Headers())).resolves.toMatchObject({ tenantId: "org-a" });
  });

  it("checks the kind of the tab's profile, not the session's active one", async () => {
    mocks.getSession.mockResolvedValue(session("org-a"));
    mocks.listMemberships.mockResolvedValue([
      membership("org-a"),
      membership("org-supplier", "supplier"),
    ]);
    const supplierTab = new Headers({ "x-sellbridge-profile": "loja-org-supplier" });
    await expect(requireSellerSession(supplierTab)).rejects.toMatchObject({ code: "FORBIDDEN" });

    mocks.getSession.mockResolvedValue(session("org-supplier"));
    await expect(requireSellerSession(new Headers(), "loja-org-a")).resolves.toMatchObject({
      tenantId: "org-a",
      profileKind: "seller",
    });
  });
});
