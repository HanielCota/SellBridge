import { describe, expect, it } from "vitest";
import {
  countParcelStages,
  isRunningOut,
  livedPeriodDays,
  salesPaceDaysLeft,
  stockDaysLeft,
  SUPPLIER_SALES_SITUATION_STATUSES,
} from "./supplier-panel-sales.ts";

describe("countParcelStages", () => {
  it("groups parcel statuses into the five steps and leaves cancellations out", () => {
    const counts = countParcelStages([
      { status: "forwarded", parcels: 4 },
      { status: "accepted", parcels: 2 },
      { status: "picking", parcels: 3 },
      { status: "ready", parcels: 2 },
      { status: "shipped", parcels: 12 },
      { status: "delivered", parcels: 290 },
      { status: "returned", parcels: 2 },
      { status: "not_delivered", parcels: 1 },
      { status: "cancelled", parcels: 9 },
    ]);
    expect(counts).toEqual({ accept: 4, preparing: 7, shipped: 12, delivered: 290, returned: 3 });
  });

  it("starts every step at zero", () => {
    expect(countParcelStages([])).toEqual({
      accept: 0,
      preparing: 0,
      shipped: 0,
      delivered: 0,
      returned: 0,
    });
  });
});

describe("stockDaysLeft", () => {
  it("projects the stock at the period's pace, rounding down", () => {
    expect(stockDaysLeft({ availableStock: 20, unitsSold: 120, periodDays: 30 })).toBe(5);
  });

  it("has no forecast for a product that did not sell", () => {
    expect(stockDaysLeft({ availableStock: 20, unitsSold: 0, periodDays: 30 })).toBeNull();
  });

  it("says zero days once the sellable stock is gone", () => {
    expect(stockDaysLeft({ availableStock: -2, unitsSold: 10, periodDays: 30 })).toBe(0);
  });

  it("keeps at least one day while a unit remains", () => {
    expect(stockDaysLeft({ availableStock: 1, unitsSold: 90, periodDays: 30 })).toBe(1);
  });
});

describe("livedPeriodDays", () => {
  it("counts only the hours already lived in a period that ends later today", () => {
    const period = {
      from: new Date("2026-11-15T03:00:00.000Z"),
      to: new Date("2026-11-16T03:00:00.000Z"),
    };

    expect(livedPeriodDays(period, new Date("2026-11-15T12:00:00.000Z"))).toBe(0.375);
  });

  it("counts the whole period once it has ended", () => {
    const period = {
      from: new Date("2026-10-01T03:00:00.000Z"),
      to: new Date("2026-10-31T03:00:00.000Z"),
    };

    expect(livedPeriodDays(period, new Date("2026-11-15T12:00:00.000Z"))).toBe(30);
  });
});

describe("salesPaceDaysLeft", () => {
  it("projects the stock from the product's sales, not from the cancellations the list shows", () => {
    const soldUnits = new Map([["product-a", 2]]);

    const daysLeft = salesPaceDaysLeft(
      { productId: "product-a", availableStock: 10 },
      soldUnits,
      10,
    );

    expect(daysLeft).toBe(50);
  });

  it("has no forecast for a product that did not sell in the period", () => {
    expect(
      salesPaceDaysLeft({ productId: "product-b", availableStock: 10 }, new Map(), 10),
    ).toBeNull();
  });
});

describe("isRunningOut", () => {
  it("flags stock that lasts two weeks or less", () => {
    expect(isRunningOut(14)).toBe(true);
    expect(isRunningOut(15)).toBe(false);
    expect(isRunningOut(null)).toBe(false);
  });

  it("leaves a sold-out product to its own warning", () => {
    expect(isRunningOut(0)).toBe(false);
  });
});

describe("SUPPLIER_SALES_SITUATION_STATUSES", () => {
  it("never counts an unpaid order", () => {
    const statuses = Object.values(SUPPLIER_SALES_SITUATION_STATUSES).flat();
    expect(statuses).not.toContain("pending");
  });
});
