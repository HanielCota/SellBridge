import { DEFAULT_FEE_SCHEDULE } from "@sellbridge/shared/fee-model";
import { describe, expect, it } from "vitest";
import {
  estimateProfit,
  feePercentLabel,
  isLowStock,
  isThinMargin,
  priceForMargin,
} from "./profit";

/** Today's 14% plus a SellBridge fee of 4%. */
const schedule = { ...DEFAULT_FEE_SCHEDULE, platformFeeBasisPoints: 400 };

describe("estimateProfit", () => {
  it("returns null when there is no price", () => {
    expect(estimateProfit(null, 1000, schedule)).toBeNull();
    expect(estimateProfit(0, 1000, schedule)).toBeNull();
  });

  it("subtracts cost, the marketplace fee and the SellBridge fee", () => {
    expect(estimateProfit(10_000, 5000, schedule)).toEqual({
      feeCents: 1400,
      platformFeeCents: 400,
      profitCents: 3200,
      marginPercent: 32,
    });
  });

  it("reports negative profit when the price does not cover costs", () => {
    expect(estimateProfit(5000, 5000, schedule)?.profitCents).toBe(-900);
  });
});

describe("priceForMargin", () => {
  it("prices so the profit is the asked share of the sale, every fee counted", () => {
    const price = priceForMargin(5814, 30, schedule);
    expect(price).toBe(11_180);
    expect(estimateProfit(price, 5814, schedule)?.marginPercent).toBe(30);
  });

  it("returns null when the fees leave no room for the margin", () => {
    expect(priceForMargin(5000, 82, schedule)).toBeNull();
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

  it("labels a fee in basis points as a percentage", () => {
    expect(feePercentLabel(1400)).toBe("14%");
    expect(feePercentLabel(1250)).toBe("12,5%");
  });
});
