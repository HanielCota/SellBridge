import type {
  applySupplierFlag,
  getFlaggableSupplier,
  listTeamSupplierFlags,
  recordCatalogEvent,
  revokeSupplierFlag,
} from "@sellbridge/database/repositories";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apply: vi.fn<typeof applySupplierFlag>(),
  revoke: vi.fn<typeof revokeSupplierFlag>(),
  list: vi.fn<typeof listTeamSupplierFlags>(),
  supplier: vi.fn<typeof getFlaggableSupplier>(),
  stockSync: vi.fn<(failureEvent: string) => Promise<boolean>>(),
  record: vi.fn<typeof recordCatalogEvent>(),
  info: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
  error: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  applySupplierFlag: mocks.apply,
  revokeSupplierFlag: mocks.revoke,
  listTeamSupplierFlags: mocks.list,
  getFlaggableSupplier: mocks.supplier,
  recordCatalogEvent: mocks.record,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/stock-sync", () => ({ requestStockSync: mocks.stockSync }));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: { info: mocks.info, error: mocks.error, warn: mocks.info },
}));
import { applyFlag, loadTeamSupplierFlags, revokeFlag } from "./supplier-flags.server";

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";
const flagId = "1b6f3a8e-2c4d-4e5f-8a9b-0c1d2e3f4a5b";
const apply = {
  supplierId,
  reason: "slow_support" as const,
  note: "Chamado parado há 5 dias",
  confirmDeactivation: false,
};
const revoke = { supplierId, flagId, revokeNote: "Aplicada por engano" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apply.mockResolvedValue({
    id: flagId,
    expiresAt: new Date("2026-12-01T00:00:00Z"),
    activeCount: 1,
    supplierDeactivated: false,
    pausedTargets: 0,
  });
  mocks.stockSync.mockResolvedValue(true);
  mocks.revoke.mockResolvedValue({ id: flagId });
  mocks.list.mockResolvedValue({ flags: [], activeCount: 0, reachedLimit: false });
  mocks.record.mockResolvedValue();
  mocks.supplier.mockResolvedValue({ name: "Cerâmica do Teste", active: true });
});

describe("applying a supplier flag", () => {
  it("refuses an agent on the server, even past the middleware", async () => {
    await expect(applyFlag({ userId: "agent-1", role: "agent" }, apply)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("lets a supervisor apply it and records who did it in the audit trail", async () => {
    await applyFlag({ userId: "supervisor-1", role: "supervisor" }, apply);

    expect(mocks.apply).toHaveBeenCalledWith({}, { ...apply, createdBy: "supervisor-1" });
    expect(mocks.record).toHaveBeenCalledWith(
      {},
      {
        adminId: "supervisor-1",
        entityType: "supplier",
        entityId: supplierId,
        action: "supplier.flag_applied",
        details: { flagId, reason: "slow_support" },
      },
    );
  });

  it("records the 3rd strike as a supplier deactivation and pushes the paused stock", async () => {
    mocks.apply.mockResolvedValue({
      id: flagId,
      expiresAt: new Date("2026-12-01T00:00:00Z"),
      activeCount: 3,
      supplierDeactivated: true,
      pausedTargets: 4,
    });
    await applyFlag(
      { userId: "supervisor-1", role: "supervisor" },
      { ...apply, confirmDeactivation: true },
    );

    expect(mocks.apply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ confirmDeactivation: true }),
    );
    expect(mocks.record).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        action: "supplier.deactivated",
        details: { pausedTargets: 4, cause: "third_flag", flagId },
      }),
    );
    expect(mocks.stockSync).toHaveBeenCalledTimes(1);
  });

  it("leaves the supplier alone below the 3rd strike", async () => {
    await applyFlag({ userId: "admin-1", role: "admin" }, apply);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.stockSync).not.toHaveBeenCalled();
  });

  it("keeps the note out of the logs", async () => {
    await applyFlag({ userId: "admin-1", role: "admin" }, apply);
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain("Chamado parado");
  });
});

describe("revoking a supplier flag", () => {
  it("refuses an agent on the server", async () => {
    await expect(revokeFlag({ userId: "agent-1", role: "agent" }, revoke)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("lets an admin revoke it and records it in the audit trail", async () => {
    await revokeFlag({ userId: "admin-1", role: "admin" }, revoke);

    expect(mocks.revoke).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ ...revoke, revokedBy: "admin-1" }),
    );
    expect(mocks.record).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ action: "supplier.flag_revoked", details: { flagId } }),
    );
  });
});

describe("listing a supplier's flags for the team", () => {
  it("tells an agent the list is read only", async () => {
    const agentView = await loadTeamSupplierFlags({ userId: "agent-1", role: "agent" }, supplierId);
    const supervisorView = await loadTeamSupplierFlags(
      { userId: "supervisor-1", role: "supervisor" },
      supplierId,
    );
    expect(agentView.canManage).toBe(false);
    expect(supervisorView.canManage).toBe(true);
  });

  it("hands over the supplier's name and flags, nothing else of its record", async () => {
    const view = await loadTeamSupplierFlags({ userId: "agent-1", role: "agent" }, supplierId);
    expect(Object.keys(view).toSorted()).toEqual([
      "activeCount",
      "canManage",
      "flags",
      "reachedLimit",
      "supplierActive",
      "supplierName",
    ]);
    expect(view.supplierName).toBe("Cerâmica do Teste");
  });
});
