import { describe, expect, it } from "vitest";
import { estimateProfit } from "./profit";

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
