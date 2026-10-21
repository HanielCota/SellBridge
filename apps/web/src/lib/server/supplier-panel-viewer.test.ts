import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantSession } from "./tenant-session.ts";

const mocks = vi.hoisted(() => ({
  findSupplierOfProfile: vi.fn<() => Promise<{ id: string; name: string } | null>>(),
}));
vi.mock("./database.ts", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => ({
  findSupplierOfProfile: mocks.findSupplierOfProfile,
}));

const { resolveSupplierPanelViewer } = await import("./supplier-panel-viewer.ts");

function sessionOf(overrides: Partial<TenantSession>): TenantSession {
  return {
    tenantId: "org-1",
    userId: "user-1",
    role: "user",
    profileKind: "supplier",
    impersonatedBy: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.findSupplierOfProfile.mockReset();
});

describe("resolveSupplierPanelViewer", () => {
  it("treats a platform admin in their own session as the team", async () => {
    await expect(
      resolveSupplierPanelViewer(sessionOf({ role: "admin", profileKind: "seller" })),
    ).resolves.toEqual({ kind: "team" });
  });

  it("treats an admin inside a supplier's account as that supplier", async () => {
    mocks.findSupplierOfProfile.mockResolvedValue({ id: "supplier-1", name: "Ateliê" });

    await expect(
      resolveSupplierPanelViewer(sessionOf({ role: "admin", impersonatedBy: "admin-1" })),
    ).resolves.toEqual({ kind: "supplier", supplierId: "supplier-1" });
  });

  it("gives a supplier profile without a brand no supplier yet", async () => {
    mocks.findSupplierOfProfile.mockResolvedValue(null);

    await expect(resolveSupplierPanelViewer(sessionOf({}))).resolves.toEqual({
      kind: "supplier",
      supplierId: null,
    });
  });

  it("treats a seller profile as a seller without looking for a supplier", async () => {
    await expect(resolveSupplierPanelViewer(sessionOf({ profileKind: "seller" }))).resolves.toEqual(
      { kind: "seller" },
    );
    expect(mocks.findSupplierOfProfile).not.toHaveBeenCalled();
  });
});
