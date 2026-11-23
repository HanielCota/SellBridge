import { describe, expect, it } from "vitest";
import {
  FULFILLMENT_TONES,
  historyNote,
  shipmentTimeline,
  shipmentsSummary,
  blockedOrderMessage,
  waitsToBeForwarded,
  toForwardWords,
  supplierShipmentStatusLabel,
} from "./shipment-timeline";

describe("shipment status tone", () => {
  it.each([
    ["forwarded", "muted"],
    ["accepted", "info"],
    ["picking", "info"],
    ["ready", "info"],
    ["shipped", "info"],
    ["delivered", "success"],
    ["not_delivered", "warning"],
    // Same red as a returned order.
    ["returned", "danger"],
    ["cancelled", "muted"],
  ] as const)("%s → %s", (status, tone) => {
    expect(FULFILLMENT_TONES[status]).toBe(tone);
  });
});

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 13, 12, minutes));
}

describe("shipment timeline", () => {
  it("lists the newest event first", () => {
    const events = [
      { id: "a", status: "forwarded" as const, actor: "Revendedor", note: "", createdAt: at(0) },
      { id: "b", status: "shipped" as const, actor: "Fornecedor", note: "", createdAt: at(5) },
      { id: "c", status: "returned" as const, actor: "Mercado Livre", note: "", createdAt: at(9) },
    ];
    expect(shipmentTimeline(events).map((event) => event.id)).toEqual(["c", "b", "a"]);
  });
});

describe("shipmentsSummary", () => {
  it("leaves the line to the badge on a paid order that waits to be sent", () => {
    expect(shipmentsSummary([], "paid")).toBeNull();
  });

  it("tells the reseller to wait while the buyer has not paid", () => {
    expect(shipmentsSummary([], "pending")).toBe("Espere o comprador pagar");
  });

  it("says there is nothing to send on a cancelled sale", () => {
    expect(shipmentsSummary([], "cancelled")).toBe("Venda cancelada: nada a enviar");
  });

  it("names each parcel with its status", () => {
    expect(
      shipmentsSummary(
        [
          { status: "picking", catalogKind: "seller", supplierName: "" },
          { status: "shipped", catalogKind: "supplier", supplierName: "Casa Bela" },
        ],
        "paid",
      ),
    ).toMatch(/^Seu envio: .+ · Casa Bela: .+$/);
  });
});

describe("blockedOrderMessage", () => {
  it("tells the reseller the buyer has not paid yet, without blaming a cancellation", () => {
    expect(blockedOrderMessage("pending", false)).toMatch(/^O comprador ainda não pagou./);
  });

  it("says a cancelled sale has nothing to send", () => {
    expect(blockedOrderMessage("cancelled", false)).toBe("Venda cancelada. Não há nada a enviar.");
  });

  it("points to the parcels of a returned order that had them", () => {
    expect(blockedOrderMessage("returned", true)).toMatch(/^Pedido devolvido. Veja em cada envio/);
  });
});

describe("toForwardWords", () => {
  it("asks to send to the supplier when the order has supplier items", () => {
    expect(toForwardWords(false)).toEqual({
      badge: "Falta enviar ao fornecedor",
      button: "Enviar ao fornecedor",
    });
  });

  it("asks the reseller to prepare an order made only of its own stock", () => {
    expect(toForwardWords(true).button).toBe("Preparar o envio");
  });
});

describe("waitsToBeForwarded", () => {
  it("marks only a paid order without parcels as waiting for the reseller", () => {
    expect(waitsToBeForwarded({ status: "paid", shipments: [] })).toBe(true);
    expect(waitsToBeForwarded({ status: "pending", shipments: [] })).toBe(false);
    expect(waitsToBeForwarded({ status: "paid", shipments: [{}] })).toBe(false);
  });
});

describe("supplierShipmentStatusLabel", () => {
  it("tells the supplier a forwarded parcel waits for its own acceptance", () => {
    expect(supplierShipmentStatusLabel("forwarded")).toBe("Aguardando seu aceite");
  });

  it("keeps the shared word for the later steps", () => {
    expect(supplierShipmentStatusLabel("shipped")).toBe("Enviado");
  });
});

describe("historyNote", () => {
  it("says the order went to the supplier's panel instead of asking to share the retired link", () => {
    const note = historyNote("Ordem de fornecimento criada. Compartilhe o link com o fornecedor.");

    expect(note).toBe("Pedido enviado ao fornecedor. Ele vê no painel do SellBridge.");
  });

  it("keeps any other note as written", () => {
    expect(historyNote("Separado com cuidado")).toBe("Separado com cuidado");
  });
});
