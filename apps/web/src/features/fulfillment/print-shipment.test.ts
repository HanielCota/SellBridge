import { describe, expect, it } from "vitest";
import { shipmentDocument } from "./print-shipment";
import type { ShipmentView } from "@/components/fulfillment/shipment-panel";
const shipment: ShipmentView = {
  id: "volume",
  supplierName: "Fornecedor",
  status: "forwarded",
  address: {
    recipient: '<script>alert("secret")</script>',
    street: "Rua",
    number: "10",
    complement: "",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    postalCode: "01001000",
  },
  items: [{ title: "Camiseta", sku: "SKU1", quantity: 2 }],
  notes: "Embalar bem",
  carrier: null,
  trackingCode: null,
  trackingUrl: null,
  events: [],
};
describe("shipment print documents", () => {
  it("escapes recipient and order data and keeps labels distinct from paid postage", () => {
    const html = shipmentDocument(shipment, "<img src=x>", "label");
    expect(html).not.toContain('<script>alert("secret")</script>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("não substitui a etiqueta de postagem");
    expect(html).not.toContain("SKU1");
  });
  it("includes item SKUs, quantities and instructions on purchase orders", () => {
    const html = shipmentDocument(shipment, "ORDER1", "order");
    expect(html).toContain("SKU1");
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("Embalar bem");
  });
});
