import { FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { supplierOrderHref, supplierOrderTabOf } from "./conversation-order-link";

describe("supplierOrderTabOf", () => {
  it("finds a tab for every parcel status", () => {
    for (const status of FULFILLMENT_STATUSES) {
      expect(() => supplierOrderTabOf(status)).not.toThrow();
    }
  });

  it("opens the queue, Enviados or Encerrados by where the parcel is", () => {
    expect(supplierOrderTabOf("picking")).toBe("todo");
    expect(supplierOrderTabOf("shipped")).toBe("shipped");
    expect(supplierOrderTabOf("cancelled")).toBe("closed");
  });
});

describe("supplierOrderHref", () => {
  it("opens Pedidos on the parcel's tab, searched by the order number", () => {
    const href = supplierOrderHref({ externalOrderId: "2000123", shipmentStatus: "shipped" });

    expect(href).toBe("/fornecedor/painel/pedidos?tab=shipped&query=2000123");
  });

  it("gives no link when the supplier has no parcel of the order", () => {
    const href = supplierOrderHref({ externalOrderId: "2000123", shipmentStatus: null });

    expect(href).toBeNull();
  });
});
