import { describe, expect, it } from "vitest";
import { FULFILLMENT_TONES, shipmentTimeline } from "./shipment-timeline";

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
