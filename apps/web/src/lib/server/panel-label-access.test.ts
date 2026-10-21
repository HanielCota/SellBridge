import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupplierPanelViewer } from "./supplier-panel-access.ts";

const mocks = vi.hoisted(() => ({
  requireTenantSession: vi.fn<() => Promise<{ tenantId: string }>>(),
  resolveSupplierPanelViewer: vi.fn<() => Promise<SupplierPanelViewer>>(),
  getSupplierPanelShipment:
    vi.fn<() => Promise<{ id: string; orderId: string; address: { street: string } | null }>>(),
}));
vi.mock("./database.ts", () => ({ database: {} }));
vi.mock("./tenant-session.ts", () => ({ requireTenantSession: mocks.requireTenantSession }));
vi.mock("./supplier-panel-viewer.ts", () => ({
  resolveSupplierPanelViewer: mocks.resolveSupplierPanelViewer,
}));
vi.mock("@sellbridge/database/repositories", () => ({
  getSupplierPanelShipment: mocks.getSupplierPanelShipment,
}));

const { panelLabelIds, panelLabelShipmentId } = await import("./panel-label-access.ts");

const SUPPLIER = "11111111-1111-4111-8111-111111111111";
const OTHER_SUPPLIER = "22222222-2222-4222-8222-222222222222";
const SHIPMENT = "33333333-3333-4333-8333-333333333333";
const ORDER = "44444444-4444-4444-8444-444444444444";
const request = new Request(`http://localhost/api/pedidos/${ORDER}/etiqueta?perfil=fornecedor-1`, {
  method: "POST",
});

beforeEach(() => {
  mocks.requireTenantSession.mockResolvedValue({ tenantId: "org-supplier" });
  mocks.resolveSupplierPanelViewer.mockResolvedValue({ kind: "supplier", supplierId: SUPPLIER });
  mocks.getSupplierPanelShipment.mockResolvedValue({
    id: SHIPMENT,
    orderId: ORDER,
    address: { street: "Rua A" },
  });
});

describe("panelLabelIds", () => {
  it("reads the panel's supplier and parcel ids, and nothing else", () => {
    const form = new URLSearchParams({ supplierId: SUPPLIER, shipmentId: SHIPMENT });
    expect(panelLabelIds(form)).toEqual({ supplierId: SUPPLIER, shipmentId: SHIPMENT });
    expect(
      panelLabelIds(new URLSearchParams({ supplierId: "x", shipmentId: SHIPMENT })),
    ).toBeNull();
    expect(panelLabelIds(null)).toBeNull();
  });
});

describe("panelLabelShipmentId", () => {
  it("lets the signed-in supplier open the label of its own parcel", async () => {
    await expect(
      panelLabelShipmentId(request, ORDER, { supplierId: SUPPLIER, shipmentId: SHIPMENT }),
    ).resolves.toBe(SHIPMENT);
  });

  it("refuses another supplier's catalog before reading any parcel", async () => {
    await expect(
      panelLabelShipmentId(request, ORDER, { supplierId: OTHER_SUPPLIER, shipmentId: SHIPMENT }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getSupplierPanelShipment).not.toHaveBeenCalled();
  });

  it("refuses a reseller profile", async () => {
    mocks.resolveSupplierPanelViewer.mockResolvedValue({ kind: "seller" });
    await expect(
      panelLabelShipmentId(request, ORDER, { supplierId: SUPPLIER, shipmentId: SHIPMENT }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a parcel of another order", async () => {
    mocks.getSupplierPanelShipment.mockResolvedValue({
      id: SHIPMENT,
      orderId: "55555555-5555-4555-8555-555555555555",
      address: { street: "Rua A" },
    });
    await expect(
      panelLabelShipmentId(request, ORDER, { supplierId: SUPPLIER, shipmentId: SHIPMENT }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a parcel that is no longer on its way out (the address is gone)", async () => {
    mocks.getSupplierPanelShipment.mockResolvedValue({
      id: SHIPMENT,
      orderId: ORDER,
      address: null,
    });
    await expect(
      panelLabelShipmentId(request, ORDER, { supplierId: SUPPLIER, shipmentId: SHIPMENT }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
