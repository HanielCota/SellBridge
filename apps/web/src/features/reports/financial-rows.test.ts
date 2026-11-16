import { describe, expect, it } from "vitest";
import {
  daySplit,
  foldRows,
  formatDayHeading,
  groupOrdersByDay,
  orderAdjustments,
  placedOnAnotherDay,
  saleDateOf,
  orderCostsCents,
  orderMargin,
  orderSplit,
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

describe("orderSplit with an unknown cost", () => {
  it("is one neutral part the size of the revenue", () => {
    expect(
      orderSplit({
        costPending: true,
        revenueCents: 9000,
        costCents: 0,
        feeCents: 0,
        platformFeeCents: 0,
        refundCents: 0,
        profitCents: 0,
      }),
    ).toEqual([{ kind: "pending", cents: 9000 }]);
  });

  it("has no margin", () => {
    expect(orderMargin({ costPending: true, revenueCents: 9000, profitCents: 0 })).toBeNull();
    expect(orderMargin({ costPending: false, revenueCents: 9000, profitCents: 900 })).toBe(0.1);
  });
});

describe("orderSplit", () => {
  it("splits the sale into outflows and what was left, dropping empty parts", () => {
    expect(
      orderSplit({
        costPending: false,
        revenueCents: 0,
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
      costPending: false,
      revenueCents: 0,
      costCents: 5000,
      feeCents: 0,
      platformFeeCents: 0,
      refundCents: 2000,
      profitCents: -1000,
    });
    expect(parts.map((part) => part.kind)).toEqual(["cost", "refund"]);
  });
});

describe("foldRows", () => {
  it("folds rows with the same key where the first one stood", () => {
    const rows = ["a1", "b1", "a2", "c1", "a3"];
    expect(foldRows(rows, (row) => row.charAt(0))).toEqual([
      { key: "a", rows: ["a1", "a2", "a3"] },
      { key: "b", rows: ["b1"] },
      { key: "c", rows: ["c1"] },
    ]);
  });

  it("returns nothing for no rows", () => {
    expect(foldRows([], String)).toEqual([]);
  });
});

describe("daySplit", () => {
  const base = { salesInDay: 23, isFirstDay: false, isLastDay: false, page: 1, totalPages: 2 };

  it("says nothing when the whole day is on the page", () => {
    expect(daySplit({ ...base, salesOnPage: 23, isLastDay: true })).toEqual({
      fromPrevious: false,
      toNext: false,
    });
  });

  it("marks the last day as going on and the next page's first day as continued", () => {
    expect(daySplit({ ...base, salesOnPage: 19, isLastDay: true }).toNext).toBe(true);
    expect(daySplit({ ...base, salesOnPage: 4, isFirstDay: true, page: 2 }).fromPrevious).toBe(
      true,
    );
  });

  it("never points past the first or the last page", () => {
    expect(daySplit({ ...base, salesOnPage: 4, isFirstDay: true, page: 1 }).fromPrevious).toBe(
      false,
    );
    expect(daySplit({ ...base, salesOnPage: 4, isLastDay: true, page: 2 }).toNext).toBe(false);
  });
});

describe("groupOrdersByDay", () => {
  it("keeps the list order and starts a group when the day changes", () => {
    const rows = [
      { id: "a", orderedAt: new Date("2026-10-10T15:00:00Z"), paidAt: null },
      { id: "b", orderedAt: new Date("2026-10-10T04:00:00Z"), paidAt: null },
      { id: "c", orderedAt: new Date("2026-10-10T01:00:00Z"), paidAt: null },
    ];
    expect(groupOrdersByDay(rows).map((day) => [day.key, day.rows.map((row) => row.id)])).toEqual([
      ["2026-10-10", ["a", "b"]],
      ["2026-10-09", ["c"]],
    ]);
  });

  it("groups a sale paid days later under its payment day", () => {
    const rows = [
      {
        id: "late",
        orderedAt: new Date("2026-10-30T15:00:00Z"),
        paidAt: new Date("2026-11-02T15:00:00Z"),
      },
      {
        id: "same",
        orderedAt: new Date("2026-11-02T12:00:00Z"),
        paidAt: new Date("2026-11-02T12:00:00Z"),
      },
    ];

    const days = groupOrdersByDay(rows);

    expect(days.map((day) => [day.key, day.rows.map((row) => row.id)])).toEqual([
      ["2026-11-02", ["late", "same"]],
    ]);
  });
});

describe("saleDateOf", () => {
  it("files a paid order under its payment date", () => {
    const paidAt = new Date("2026-11-02T13:00:00Z");

    expect(saleDateOf({ orderedAt: new Date("2026-10-30T13:00:00Z"), paidAt })).toEqual(paidAt);
  });

  it("files an order never paid under its order date", () => {
    const orderedAt = new Date("2026-10-30T13:00:00Z");

    expect(saleDateOf({ orderedAt, paidAt: null })).toEqual(orderedAt);
  });
});

describe("placedOnAnotherDay", () => {
  it("gives the order date when the payment came on a later day", () => {
    const orderedAt = new Date("2026-10-30T13:00:00Z");

    const placed = placedOnAnotherDay({ orderedAt, paidAt: new Date("2026-11-02T13:00:00Z") });

    expect(placed).toEqual(orderedAt);
  });

  it("stays quiet when the order was paid the same Brazil day", () => {
    // 23:00 and 23:30 of 10 Oct in Brazil, though 11 Oct in UTC for the payment.
    const placed = placedOnAnotherDay({
      orderedAt: new Date("2026-10-11T02:00:00Z"),
      paidAt: new Date("2026-10-11T02:30:00Z"),
    });

    expect(placed).toBeNull();
  });

  it("stays quiet for an order never paid", () => {
    expect(placedOnAnotherDay({ orderedAt: new Date(), paidAt: null })).toBeNull();
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
