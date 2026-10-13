import type { applyMarketplaceShipment, updateShipment } from "@sellbridge/database/repositories";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateShipment: vi.fn<typeof updateShipment>(),
  applyMarketplaceShipment: vi.fn<typeof applyMarketplaceShipment>(),
  loadShipping: vi.fn<(tenantId: string, orderId: string) => Promise<unknown>>(),
  enqueue: vi.fn<() => Promise<void>>(),
  warn: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  updateShipment: mocks.updateShipment,
  applyMarketplaceShipment: mocks.applyMarketplaceShipment,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/queues", () => ({ enqueueStockPriceSync: mocks.enqueue }));
vi.mock("@sellbridge/shared/logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("./marketplace.server", () => ({ loadMarketplaceShipping: mocks.loadShipping }));
import { refreshMarketplaceShipment, writeShipmentUpdate } from "./shipments.server";

const update = {
  shipmentId: "4f8f2f0a-6c55-4c1e-9d4e-2a7a2f8f1b11",
  status: "shipped" as const,
  carrier: "Correios",
  trackingCode: "BR123",
  trackingUrl: "",
  note: "",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enqueue.mockResolvedValue(undefined);
  mocks.updateShipment.mockResolvedValue(undefined);
  mocks.applyMarketplaceShipment.mockResolvedValue(undefined);
});

describe("shipment writes and stock sync", () => {
  it("asks for a stock sync after the supplier or reseller moves a shipment", async () => {
    await writeShipmentUpdate(update, { token: "token-de-teste" });
    expect(mocks.updateShipment).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("asks for a stock sync after the marketplace tracking is refreshed", async () => {
    await refreshMarketplaceShipment("tenant", "4f8f2f0a-6c55-4c1e-9d4e-2a7a2f8f1b12");
    expect(mocks.applyMarketplaceShipment).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved shipment when the sync request fails", async () => {
    mocks.enqueue.mockRejectedValue(new Error("Redis indisponível"));
    await expect(writeShipmentUpdate(update, { tenantId: "tenant" })).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith("stock.sync_deferred", { error: expect.any(Error) });
  });

  it("does not ask for a sync when the shipment write fails", async () => {
    mocks.updateShipment.mockRejectedValue(new Error("Envio não encontrado"));
    await expect(writeShipmentUpdate(update, { tenantId: "tenant" })).rejects.toThrow(
      "Envio não encontrado",
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
