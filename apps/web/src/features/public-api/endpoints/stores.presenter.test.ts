import type { StoreConnectionSummary } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { presentStore } from "./stores.presenter";

const store: StoreConnectionSummary = {
  id: "8f8e7c1a-0000-4000-8000-000000000001",
  marketplace: "mercado_livre",
  shopName: "Loja da Ana",
  externalShopId: "ML-123",
  supplierIds: [],
  status: "connected",
  lastError: "falha antiga",
  expiresAt: new Date("2026-04-01T00:00:00Z"),
  lastWebhookAt: null,
  connectedAt: new Date("2026-01-02T10:00:00Z"),
};

describe("presentStore", () => {
  it("shows only the public fields", () => {
    expect(presentStore(store)).toEqual({
      id: store.id,
      marketplace: "mercado_livre",
      name: "Loja da Ana",
      status: "connected",
      connectedAt: "2026-01-02T10:00:00.000Z",
      supplierIds: [],
      supplierId: null,
    });
  });

  it("lists every supplier the store sells and keeps the oldest as supplierId", () => {
    const suppliers = [
      "8f8e7c1a-0000-4000-8000-0000000000a1",
      "8f8e7c1a-0000-4000-8000-0000000000a2",
    ];

    const presented = presentStore({ ...store, supplierIds: suppliers });

    expect(presented).toMatchObject({ supplierIds: suppliers, supplierId: suppliers[0] });
  });

  it("leaves disconnected stores out", () => {
    expect(presentStore({ ...store, status: "disconnected" })).toBeNull();
  });
});
