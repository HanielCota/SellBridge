import { describe, expect, it } from "vitest";
import { feeScheduleFrom } from "./fee-schedule";

describe("feeScheduleFrom", () => {
  it("carries every configured fee into the model the previews use", () => {
    expect(
      feeScheduleFrom({
        ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS: 1250,
        PLATFORM_FEE_BASIS_POINTS: 400,
        MIN_MARGIN_PERCENT: 10,
      }),
    ).toEqual({
      channel: "mercado_livre",
      marketplaceFeeBasisPoints: 1250,
      categoryFeeBasisPoints: {},
      platformFeeBasisPoints: 400,
      defaultWeightGrams: 500,
      minimumMarginPercent: 10,
    });
  });
});
