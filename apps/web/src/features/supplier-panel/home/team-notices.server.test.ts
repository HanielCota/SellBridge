import type { listActiveSupplierFlags } from "@sellbridge/database/repositories";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listActive: vi.fn<typeof listActiveSupplierFlags>() }));
vi.mock("@sellbridge/database/repositories", () => ({
  listActiveSupplierFlags: mocks.listActive,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
import { loadTeamNotices } from "./team-notices.server";

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";

describe("loadTeamNotices", () => {
  it("never hands the supplier who applied a flag nor a revoke note", async () => {
    const leaked = {
      id: "1b6f3a8e-2c4d-4e5f-8a9b-0c1d2e3f4a5b",
      reason: "order_error" as const,
      note: "Cor trocada no pedido",
      createdAt: new Date("2026-10-01T12:00:00Z"),
      expiresAt: new Date("2026-12-30T12:00:00Z"),
      createdByName: "Ana da equipe",
      revokeNote: "nota interna",
    };
    mocks.listActive.mockResolvedValue([leaked]);

    const notices = await loadTeamNotices(supplierId);

    expect(notices).toEqual([
      {
        id: leaked.id,
        reason: "order_error",
        note: "Cor trocada no pedido",
        createdAt: leaked.createdAt,
        expiresAt: leaked.expiresAt,
      },
    ]);
    expect(mocks.listActive).toHaveBeenCalledWith({}, supplierId, expect.any(Date));
  });
});
