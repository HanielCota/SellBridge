import { describe, expect, it } from "vitest";
import {
  ESTIMATED_MARKETPLACE_FEE_PERCENT_LABEL,
  estimateProfit,
  isLowStock,
  isThinMargin,
} from "./profit";

describe("estimateProfit", () => {
  it("returns null when there is no price", () => {
    expect(estimateProfit(null, 1000)).toBeNull();
    expect(estimateProfit(0, 1000)).toBeNull();
  });

  it("subtracts cost and estimated fee", () => {
    expect(estimateProfit(10_000, 5000)).toEqual({
      feeCents: 1400,
      profitCents: 3600,
      marginPercent: 36,
    });
  });

  it("reports negative profit when the price does not cover costs", () => {
    expect(estimateProfit(5000, 5000)?.profitCents).toBe(-700);
  });
});

describe("listing health rules", () => {
  it("flags margins under 15%", () => {
    expect(isThinMargin(14.9)).toBe(true);
    expect(isThinMargin(15)).toBe(false);
    expect(isThinMargin(-3)).toBe(true);
  });

  it("flags stock of 1 to 5 units as low, but not an empty stock", () => {
    expect(isLowStock(5)).toBe(true);
    expect(isLowStock(1)).toBe(true);
    expect(isLowStock(6)).toBe(false);
    expect(isLowStock(0)).toBe(false);
  });

  it("labels the estimated fee as a percentage", () => {
    expect(ESTIMATED_MARKETPLACE_FEE_PERCENT_LABEL).toBe("14%");
  });
});
