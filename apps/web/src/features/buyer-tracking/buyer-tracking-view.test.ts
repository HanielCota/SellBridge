import { describe, expect, it } from "vitest";
import { buyerProgress, buyerTrackingView, type BuyerParcel } from "./buyer-tracking-view";

const parcel: BuyerParcel = {
  status: "shipped",
  carrier: "Correios",
  trackingCode: "QB482913057BR",
  trackingUrl: null,
  estimatedDeliveryAt: new Date("2099-01-10T12:00:00Z"),
  externalOrderId: "7781",
  orderedAt: new Date("2026-10-22T12:00:00Z"),
  storeName: "Loja do Tião",
  destination: "Campinas/SP",
  items: [{ title: "Abajur Nórdico", quantity: 1 }],
  steps: [
    { status: "forwarded", createdAt: new Date("2026-10-22T13:00:00Z") },
    { status: "accepted", createdAt: new Date("2026-10-22T14:00:00Z") },
    { status: "picking", createdAt: new Date("2026-10-23T09:00:00Z") },
    { status: "shipped", createdAt: new Date("2026-10-23T14:00:00Z") },
    { status: "shipped", createdAt: new Date("2026-10-23T15:00:00Z") },
  ],
};

describe("buyerTrackingView", () => {
  it("speaks of the store's preparation, never of who prepared it", () => {
    const view = buyerTrackingView(parcel, []);
    expect(view.headline).toBe("A caminho");
    expect(view.history.map((entry) => entry.label)).toEqual([
      "A caminho",
      "Em preparação",
      "Pedido confirmado",
    ]);
    expect(JSON.stringify(view)).not.toMatch(/Fornecedor|Revendedor/);
  });

  it("tells the buyer when the parcel should arrive", () => {
    expect(buyerTrackingView(parcel, []).subline).toBe("Chega até 10/01/2099");
  });
});

describe("buyerProgress", () => {
  it("has four steps and flags the one where the delivery failed", () => {
    expect(buyerProgress("not_delivered")?.map((step) => step.state)).toEqual([
      "done",
      "done",
      "problem",
      "todo",
    ]);
  });
});
