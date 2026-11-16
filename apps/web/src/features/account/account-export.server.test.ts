import { forbiddenError, unauthorizedError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccountSession: vi.fn<() => Promise<{ userId: string; impersonatedBy: string | null }>>(),
  listMemberships: vi.fn<(userId: string) => Promise<{ organizationId: string }[]>>(),
  requireTenantSession:
    vi.fn<() => Promise<{ tenantId: string; userId: string; impersonatedBy: string | null }>>(),
  collectAccountExport: vi.fn<(database: unknown, account: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/tenant-session", () => ({
  requireAccountSession: mocks.requireAccountSession,
  requireTenantSession: mocks.requireTenantSession,
}));
vi.mock("@/lib/server/membership", () => ({ listMemberships: mocks.listMemberships }));
vi.mock("@sellbridge/database/repositories", () => ({
  collectAccountExport: mocks.collectAccountExport,
}));

const { handleAccountExport } = await import("./account-export.server");

function exportRequest(): Request {
  return new Request("https://sellbridge.test/api/conta/exportar");
}

let userCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  userCounter += 1;
  mocks.requireAccountSession.mockResolvedValue({
    userId: `user-${userCounter}`,
    impersonatedBy: null,
  });
  mocks.listMemberships.mockResolvedValue([{ organizationId: "tenant-a" }]);
  mocks.requireTenantSession.mockResolvedValue({
    tenantId: "tenant-a",
    userId: `user-${userCounter}`,
    impersonatedBy: null,
  });
  mocks.collectAccountExport.mockResolvedValue({ format: "sellbridge-account-export/1" });
});

describe("handleAccountExport", () => {
  it("downloads the account's data as a JSON file that is never cached", async () => {
    const response = await handleAccountExport(exportRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="sellbridge-meus-dados-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ format: "sellbridge-account-export/1" });
    expect(mocks.collectAccountExport).toHaveBeenCalledWith(
      {},
      { userId: `user-${userCounter}`, tenantId: "tenant-a" },
    );
  });

  it("asks to sign in without a session", async () => {
    mocks.requireAccountSession.mockRejectedValue(unauthorizedError());
    expect((await handleAccountExport(exportRequest())).status).toBe(401);
  });

  it("tells a signed-in account without a workspace why, instead of asking to sign in", async () => {
    mocks.requireTenantSession.mockRejectedValue(
      forbiddenError("Sua conta não possui uma organização ativa"),
    );
    const response = await handleAccountExport(exportRequest());
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Sua conta não possui uma organização ativa");
  });

  // Regression: an invited attendant has no profile, and the download answered 403.
  it("downloads only the personal data of a team member with no profile", async () => {
    mocks.listMemberships.mockResolvedValue([]);

    const response = await handleAccountExport(exportRequest());

    expect(response.status).toBe(200);
    expect(mocks.requireTenantSession).not.toHaveBeenCalled();
    expect(mocks.collectAccountExport).toHaveBeenCalledWith(
      {},
      { userId: `user-${userCounter}`, tenantId: null },
    );
  });

  it("refuses while the team is inside the account: the data is the customer's", async () => {
    mocks.requireTenantSession.mockResolvedValue({
      tenantId: "tenant-a",
      userId: "user-visited",
      impersonatedBy: "admin-1",
    });
    expect((await handleAccountExport(exportRequest())).status).toBe(403);
    expect(mocks.collectAccountExport).not.toHaveBeenCalled();
  });

  it("allows three downloads an hour per account", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      statuses.push((await handleAccountExport(exportRequest())).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
