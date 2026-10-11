import { describe, expect, it } from "vitest";
import {
  formatDayHeading,
  groupOrdersByDay,
  orderAdjustments,
  orderCostsCents,
  orderSplit,
  perHundred,
  reportDayKey,
} from "./financial-rows";

describe("orderCostsCents", () => {
  it("adds product cost and fees as a negative amount", () => {
    expect(orderCostsCents({ costCents: 4000, feeCents: 1400, platformFeeCents: 100 })).toBe(-5500);
  });

  it("returns a plain zero when the order had no costs", () => {
    expect(Object.is(orderCostsCents({ costCents: 0, feeCents: 0, platformFeeCents: 0 }), 0)).toBe(
      true,
    );
  });
});

describe("orderAdjustments", () => {
  it("lists only the flows that happened, in display order", () => {
    expect(orderAdjustments({ commissionCents: 300, refundCents: 0, returnCents: 5000 })).toEqual([
      { kind: "commission", cents: 300 },
      { kind: "return", cents: 5000 },
    ]);
  });

  it("is empty when nothing moved", () => {
    expect(orderAdjustments({ commissionCents: 0, refundCents: 0, returnCents: 0 })).toEqual([]);
  });

  it("is empty when commission and refund cancel out and nothing came back", () => {
    expect(orderAdjustments({ commissionCents: 500, refundCents: 500, returnCents: 0 })).toEqual(
      [],
    );
  });

  it("keeps a refund on its own", () => {
    expect(orderAdjustments({ commissionCents: 0, refundCents: 700, returnCents: 0 })).toEqual([
      { kind: "refund", cents: 700 },
    ]);
  });
});

describe("orderSplit", () => {
  it("splits the sale into outflows and what was left, dropping empty parts", () => {
    expect(
      orderSplit({
        costCents: 6000,
        feeCents: 1500,
        platformFeeCents: 100,
        refundCents: 0,
        profitCents: 4900,
      }),
    ).toEqual([
      { kind: "cost", cents: 6000 },
      { kind: "fee", cents: 1600 },
      { kind: "profit", cents: 4900 },
    ]);
  });

  it("keeps only the outflows on a loss", () => {
    const parts = orderSplit({
      costCents: 5000,
      feeCents: 0,
      platformFeeCents: 0,
      refundCents: 2000,
      profitCents: -1000,
    });
    expect(parts.map((part) => part.kind)).toEqual(["cost", "refund"]);
  });
});

describe("perHundred", () => {
  it("rounds the shares so they still add up to 100", () => {
    const shares = perHundred([125_018, 37_243, 105_393]);
    expect(shares).toEqual([47, 14, 39]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
  });

  it("gives the leftover unit to the share that lost the most in rounding", () => {
    expect(perHundred([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("is all zeros when there is nothing to split", () => {
    expect(perHundred([0, 0])).toEqual([0, 0]);
  });
});

describe("reportDayKey", () => {
  it("reads the day in Brazil time, not UTC", () => {
    expect(reportDayKey(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
    expect(reportDayKey(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-10");
  });
});

describe("groupOrdersByDay", () => {
  it("keeps the list order and starts a group when the day changes", () => {
    const rows = [
      { id: "a", orderedAt: new Date("2026-10-10T15:00:00Z") },
      { id: "b", orderedAt: new Date("2026-10-10T04:00:00Z") },
      { id: "c", orderedAt: new Date("2026-10-10T01:00:00Z") },
    ];
    expect(groupOrdersByDay(rows).map((day) => [day.key, day.rows.map((row) => row.id)])).toEqual([
      ["2026-10-10", ["a", "b"]],
      ["2026-10-09", ["c"]],
    ]);
  });
});

describe("formatDayHeading", () => {
  const now = new Date("2026-10-10T15:00:00Z");

  it("names today and yesterday", () => {
    expect(formatDayHeading("2026-10-10", now)).toBe("Hoje");
    expect(formatDayHeading("2026-10-09", now)).toBe("Ontem");
  });

  it("spells out older days with the weekday, and the year only when it differs", () => {
    expect(formatDayHeading("2026-10-07", now)).toBe("Quarta-feira, 7 de out.");
    expect(formatDayHeading("2025-12-31", now)).toBe("Quarta-feira, 31 de dez. de 2025");
  });
});
