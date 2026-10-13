import { describe, expect, it } from "vitest";
import {
  availableUnits,
  offeredUnits,
  stockMoveFor,
  type OrderStatus,
  type StockMove,
  type StockState,
} from "./stock-reservation.ts";

const cases: [OrderStatus, StockState, StockMove][] = [
  // An unpaid order holds nothing.
  ["pending", "pending", "none"],
  // Paid holds the units without taking them off the shelf.
  ["paid", "pending", "reserve"],
  ["paid", "reserved", "none"],
  // A shortage is tried again while the order waits to ship.
  ["paid", "short", "reserve"],
  // Shipped: the units left the supplier, whatever happened before.
  ["shipped", "pending", "consume"],
  ["shipped", "reserved", "consume"],
  ["shipped", "short", "consume"],
  ["delivered", "pending", "consume"],
  ["delivered", "reserved", "consume"],
  ["delivered", "consumed", "none"],
  ["shipped", "consumed", "none"],
  // Undone: a hold is let go, units that left come back, a shortage just closes.
  ["cancelled", "reserved", "release"],
  ["returned", "reserved", "release"],
  ["cancelled", "consumed", "restock"],
  ["returned", "consumed", "restock"],
  ["cancelled", "short", "settle"],
  ["returned", "short", "settle"],
  ["cancelled", "pending", "none"],
  // Released is final: a reopened order does not take the stock again.
  ["paid", "released", "none"],
  ["shipped", "released", "none"],
  ["cancelled", "released", "none"],
  // Sold before reservations existed: never touched.
  ["paid", "untracked", "none"],
  ["shipped", "untracked", "none"],
  ["cancelled", "untracked", "none"],
];

describe("stockMoveFor", () => {
  it.each(cases)("%s order with a %s item → %s", (status, state, move) => {
    expect(stockMoveFor(status, state)).toBe(move);
  });
});

describe("availableUnits", () => {
  it("is what is on the shelf minus what paid orders hold", () => {
    expect(availableUnits(10, 2)).toBe(8);
  });

  it("never goes below zero when the shelf count drops under the holds", () => {
    expect(availableUnits(1, 3)).toBe(0);
  });
});

describe("offeredUnits", () => {
  it("keeps the safety margin off the marketplaces, never below zero", () => {
    expect(offeredUnits(10, 2, 3)).toBe(5);
    expect(offeredUnits(4, 2, 3)).toBe(0);
    expect(offeredUnits(4, 2, 0)).toBe(2);
  });

  it("reads a broken margin as no margin", () => {
    expect(offeredUnits(4, 0, Number.NaN)).toBe(4);
    expect(offeredUnits(4, 0, -2)).toBe(4);
    expect(offeredUnits(4, 0, 1.9)).toBe(3);
  });
});
