import { describe, expect, it } from "vitest";
import { isStockFromBling } from "./stock-from-bling";

const NOW = new Date("2026-11-19T15:00:00Z");

describe("isStockFromBling", () => {
  it("is true for a linked product read by a recent check", () => {
    const product = { erpProductId: 501, erpStockReadAt: new Date("2026-11-19T14:50:00Z") };

    expect(isStockFromBling(product, NOW)).toBe(true);
  });

  it("gives the field back when the last reading is over an hour old", () => {
    const product = { erpProductId: 501, erpStockReadAt: new Date("2026-11-19T13:59:00Z") };

    expect(isStockFromBling(product, NOW)).toBe(false);
  });

  it("is false for a product not linked to Bling or never read", () => {
    expect(isStockFromBling({ erpProductId: null, erpStockReadAt: NOW }, NOW)).toBe(false);
    expect(isStockFromBling({ erpProductId: 501, erpStockReadAt: null }, NOW)).toBe(false);
    expect(isStockFromBling(null, NOW)).toBe(false);
  });

  it("reads a reading sent as text and refuses one that is not a date", () => {
    expect(
      isStockFromBling({ erpProductId: 501, erpStockReadAt: "2026-11-19T14:55:00Z" }, NOW),
    ).toBe(true);
    expect(isStockFromBling({ erpProductId: 501, erpStockReadAt: "ontem" }, NOW)).toBe(false);
  });
});
