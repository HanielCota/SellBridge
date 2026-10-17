import { conflictError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owned: vi.fn<() => Promise<{ id: string; status: string; orderStatus: string }[]>>(),
  write: vi.fn<(update: { shipmentId: string }, scope: unknown) => Promise<unknown>>(),
  error: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
  info: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({ supplierOwnedShipments: mocks.owned }));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/features/fulfillment/shipments.server", () => ({ writeShipmentUpdate: mocks.write }));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: { error: mocks.error, info: mocks.info },
}));
import { acceptSupplierShipments, writeSupplierShipmentUpdate } from "./orders.server";

const supplierId = "8c1f2b6e-3c1a-4a59-9d2e-1b2c3d4e5f60";
const ids = {
  fine: "11111111-1111-4111-8111-111111111111",
  refused: "22222222-2222-4222-8222-222222222222",
  crashed: "33333333-3333-4333-8333-333333333333",
  accepted: "44444444-4444-4444-8444-444444444444",
  foreign: "55555555-5555-4555-8555-555555555555",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.owned.mockResolvedValue([
    { id: ids.fine, status: "forwarded", orderStatus: "paid" },
    { id: ids.refused, status: "forwarded", orderStatus: "cancelled" },
    { id: ids.crashed, status: "forwarded", orderStatus: "paid" },
    { id: ids.accepted, status: "accepted", orderStatus: "paid" },
  ]);
  mocks.write.mockImplementation(async (update) => {
    if (update.shipmentId === ids.refused) {
      throw conflictError("O pedido não está liberado para envio");
    }
    if (update.shipmentId === ids.crashed) {
      throw new Error("connection reset");
    }
    return { statusChanged: true };
  });
});

describe("acceptSupplierShipments", () => {
  it("reports each parcel: accepted, refused with the reason, or failed and logged", async () => {
    const report = await acceptSupplierShipments({
      supplierId,
      shipmentIds: [ids.fine, ids.refused, ids.crashed, ids.accepted, ids.foreign],
    });
    expect(report.acceptedCount).toBe(1);
    expect(report.failedCount).toBe(4);
    expect(report.results).toEqual([
      { shipmentId: ids.fine, accepted: true },
      { shipmentId: ids.refused, accepted: false, reason: "O pedido não está liberado para envio" },
      {
        shipmentId: ids.crashed,
        accepted: false,
        reason: "Não foi possível aceitar este pedido agora. Tente de novo.",
      },
      { shipmentId: ids.accepted, accepted: false, reason: 'Já estava em "Aceito"; nada mudou.' },
      {
        shipmentId: ids.foreign,
        accepted: false,
        reason: "Este pedido não está mais entre os seus. Atualize a lista.",
      },
    ]);
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0]?.[1]).toMatchObject({ shipmentId: ids.crashed });
  });

  it("writes only forwarded parcels of the supplier, as the supplier", async () => {
    await acceptSupplierShipments({
      supplierId,
      shipmentIds: [ids.fine, ids.accepted, ids.foreign],
    });
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId: ids.fine, status: "accepted" }),
      { supplierId },
    );
  });
});

describe("writeSupplierShipmentUpdate", () => {
  it("writes the panel's step scoped to the supplier", async () => {
    const update = {
      shipmentId: ids.fine,
      status: "picking" as const,
      carrier: "",
      trackingCode: "",
      trackingUrl: "",
      note: "",
    };
    await writeSupplierShipmentUpdate({ supplierId, update });
    expect(mocks.write).toHaveBeenCalledWith(update, { supplierId });
  });
});
