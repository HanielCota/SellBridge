import { describe, expect, it } from "vitest";
import { feeScheduleFrom } from "./fee-schedule";

describe("feeScheduleFrom", () => {
  it("carries the configured fees and leaves out SellBridge's, which the supplier pays", () => {
    expect(
      feeScheduleFrom({
        ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS: 1250,
        MIN_MARGIN_PERCENT: 10,
      }),
    ).toEqual({
      channel: "mercado_livre",
      marketplaceFeeBasisPoints: 1250,
      categoryFeeBasisPoints: {},
      platformFeeBasisPoints: 0,
      defaultWeightGrams: 500,
      minimumMarginPercent: 10,
    });
  });
});
