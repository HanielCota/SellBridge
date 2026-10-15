import { describe, expect, it } from "vitest";
import { feeScheduleFrom } from "./fee-schedule";

describe("feeScheduleFrom", () => {
  it("carries every configured fee into the model the previews use", () => {
    expect(
      feeScheduleFrom({
        ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS: 1250,
        PLATFORM_FEE_BASIS_POINTS: 400,
        ESTIMATED_SHIPPING_CENTS: 1_990,
        MIN_MARGIN_PERCENT: 10,
      }),
    ).toEqual({
      marketplaceFeeBasisPoints: 1250,
      categoryFeeBasisPoints: {},
      platformFeeBasisPoints: 400,
      estimatedShippingCents: 1_990,
      minimumMarginPercent: 10,
    });
  });
});
