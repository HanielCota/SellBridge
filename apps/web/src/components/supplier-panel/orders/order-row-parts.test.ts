import { describe, expect, it } from "vitest";
import { liveUrgency } from "./countdown-badge";
import { itemsSummary } from "./order-row-parts";

describe("itemsSummary", () => {
  it("names the first item with its SKU and counts the rest", () => {
    expect(
      itemsSummary([
        { title: "Camiseta", sku: "CAM-01", quantity: 2 },
        { title: "Calça", sku: "CAL-01", quantity: 1 },
        { title: "Meia", sku: "", quantity: 3 },
      ]),
    ).toBe("2× Camiseta (CAM-01) e mais 2 itens");
    expect(itemsSummary([{ title: "Meia", sku: "", quantity: 1 }])).toBe("1× Meia");
    expect(itemsSummary([])).toBe("Sem itens");
  });
});

describe("liveUrgency", () => {
  it("counts down against the clock, turning overdue once the deadline passes", () => {
    const deadline = { kind: "dispatch" as const, at: new Date("2026-10-16T12:00:00.000Z") };
    expect(liveUrgency(deadline, new Date("2026-10-16T11:00:00.000Z"))).toEqual({
      urgency: "danger",
      label: "Despacho em 1 h",
    });
    expect(liveUrgency(deadline, new Date("2026-10-16T14:00:00.000Z"))).toEqual({
      urgency: "overdue",
      label: "Despacho atrasado há 2 h",
    });
    expect(liveUrgency(null, new Date())).toEqual({ urgency: "normal", label: "Sem prazo" });
  });
});
