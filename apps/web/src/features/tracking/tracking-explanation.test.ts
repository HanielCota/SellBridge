import { describe, expect, it } from "vitest";
import type { CarrierEventKind, CarrierTrackingEvent } from "./carrier-tracking";
import { explainTracking, type ParcelFacts } from "./tracking-explanation";

const now = new Date("2026-10-22T15:00:00Z");

function hoursAgo(hours: number): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}

function parcel(overrides: Partial<ParcelFacts> = {}): ParcelFacts {
  return {
    status: "shipped",
    catalogKind: "supplier",
    supplierName: "Casa Aurora",
    delay: null,
    acceptBy: null,
    dispatchBy: null,
    dispatchDeadlineAt: null,
    estimatedDeliveryAt: null,
    shippedAt: null,
    ...overrides,
  };
}

function event(kind: CarrierEventKind, at: Date, description = "Passo"): CarrierTrackingEvent {
  return { kind, at, description, place: "Curitiba/PR" };
}

describe("explainTracking", () => {
  it("names the supplier as late only once its dispatch deadline passed", () => {
    const late = explainTracking({
      parcel: parcel({
        status: "picking",
        delay: "dispatch_overdue",
        dispatchBy: new Date("2026-10-20T03:00:00Z"),
      }),
      carrierEvents: null,
      now,
    });
    expect(late).toMatchObject({ holder: "supplier", tone: "warning" });
    expect(late.title).toBe("O fornecedor ainda não enviou o pacote");
    expect(late.lines[0]).toBe("O prazo para enviar era 20/10.");
  });

  it("says a parcel being prepared within its deadline is on time", () => {
    const onTime = explainTracking({
      parcel: parcel({ status: "accepted", dispatchBy: new Date("2026-10-24T12:00:00Z") }),
      carrierEvents: null,
      now,
    });
    expect(onTime).toMatchObject({ holder: "supplier", tone: "info" });
    expect(onTime.lines).toEqual([
      "Casa Aurora tem até 24/10 para enviar.",
      "Até aqui, está no prazo.",
    ]);
  });

  it("speaks to the reseller about its own parcel", () => {
    const own = explainTracking({
      parcel: parcel({ status: "picking", catalogKind: "seller", delay: "dispatch_overdue" }),
      carrierEvents: null,
      now,
    });
    expect(own).toMatchObject({ holder: "you", title: "Você ainda não enviou o pacote" });
  });

  it("points at the collection when a sent parcel waits days for the first scan", () => {
    const waiting = explainTracking({
      parcel: parcel({ shippedAt: hoursAgo(72) }),
      carrierEvents: [],
      now,
    });
    expect(waiting).toMatchObject({ holder: "collection", tone: "warning" });
    expect(waiting.lines.join(" ")).toContain("coleta do marketplace ou na agência");
  });

  it("does not warn while the first scan is still within two days", () => {
    const waiting = explainTracking({
      parcel: parcel({ shippedAt: hoursAgo(10) }),
      carrierEvents: [],
      now,
    });
    expect(waiting).toMatchObject({ holder: "collection", tone: "info" });
  });

  it("explains a slow first scan even after the parcel moved on", () => {
    const slow = explainTracking({
      parcel: parcel({ shippedAt: hoursAgo(120) }),
      carrierEvents: [event("posted", hoursAgo(48)), event("in_transit", hoursAgo(20))],
      now,
    });
    expect(slow).toMatchObject({ holder: "carrier", title: "A caminho com a transportadora" });
    expect(slow.lines.at(-1)).toContain("3 dias depois");
  });

  it("blames the carrier, not the supplier, for a delivery past the estimate after an on-time dispatch", () => {
    const late = explainTracking({
      parcel: parcel({
        shippedAt: new Date("2026-10-13T15:00:00Z"),
        dispatchDeadlineAt: new Date("2026-10-14T03:00:00Z"),
        estimatedDeliveryAt: new Date("2026-10-19T03:00:00Z"),
      }),
      carrierEvents: [
        event("posted", new Date("2026-10-13T20:00:00Z")),
        event("in_transit", hoursAgo(30)),
      ],
      now,
    });
    expect(late).toMatchObject({ holder: "carrier", tone: "warning" });
    expect(late.title).toBe("Entrega atrasada na transportadora");
    expect(late.lines).toContain("O fornecedor enviou dentro do prazo.");
  });

  it("says when the dispatch itself was after the deadline", () => {
    const late = explainTracking({
      parcel: parcel({
        shippedAt: new Date("2026-10-16T15:00:00Z"),
        dispatchDeadlineAt: new Date("2026-10-14T03:00:00Z"),
        estimatedDeliveryAt: new Date("2026-10-19T03:00:00Z"),
      }),
      carrierEvents: null,
      now,
    });
    expect(late.title).toBe("A entrega passou da previsão");
    expect(late.lines).toContain("O envio foi feito depois do prazo, que era 14/10.");
  });

  it("explains a failed delivery attempt as the carrier's step", () => {
    const failed = explainTracking({
      parcel: parcel({ shippedAt: hoursAgo(80) }),
      carrierEvents: [
        event("posted", hoursAgo(78)),
        event("delivery_failed", hoursAgo(2), "Destinatário ausente"),
      ],
      now,
    });
    expect(failed).toMatchObject({ holder: "carrier", title: "A entrega não deu certo" });
    expect(failed.lines).toContain("Essa etapa não depende do fornecedor.");
  });

  it("explains a parcel on its way back to the sender", () => {
    const returning = explainTracking({
      parcel: null,
      carrierEvents: [event("posted", hoursAgo(100)), event("returning", hoursAgo(5))],
      now,
    });
    expect(returning).toMatchObject({ holder: "sender", tone: "danger" });
    expect(returning.lines).not.toContain("Essa etapa não depende do fornecedor.");
  });

  it("reads events in time order whatever order the carrier sent", () => {
    const delivered = explainTracking({
      parcel: null,
      carrierEvents: [event("delivered", hoursAgo(1)), event("posted", hoursAgo(60))],
      now,
    });
    expect(delivered).toMatchObject({ holder: "buyer", tone: "success", title: "Pedido entregue" });
  });

  it("keeps the marketplace's delivered status over a carrier still in transit", () => {
    const delivered = explainTracking({
      parcel: parcel({ status: "delivered" }),
      carrierEvents: [event("posted", hoursAgo(60))],
      now,
    });
    expect(delivered.title).toBe("Pedido entregue");
  });

  it("shows a cancelled parcel as cancelled", () => {
    expect(
      explainTracking({ parcel: parcel({ status: "cancelled" }), carrierEvents: [], now }).holder,
    ).toBe("closed");
  });

  it("says a parcel is waiting at the agency for the buyer", () => {
    const pickup = explainTracking({
      parcel: null,
      carrierEvents: [event("posted", hoursAgo(60)), event("awaiting_pickup", hoursAgo(3))],
      now,
    });
    expect(pickup).toMatchObject({ holder: "pickup", title: "Esperando o comprador retirar" });
  });
});
