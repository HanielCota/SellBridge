import { describe, expect, it } from "vitest";
import { orderAdjustments, orderCostsCents } from "./financial-rows";

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
