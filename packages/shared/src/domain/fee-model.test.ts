import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEE_SCHEDULE,
  estimatedMarketplaceFeeCents,
  estimateSale,
  type FeeSchedule,
  priceForMargin,
} from "./fee-model.ts";
import { computeOrderFinance } from "./finance.ts";

const schedule: FeeSchedule = {
  ...DEFAULT_FEE_SCHEDULE,
  marketplaceFeeBasisPoints: 1200,
  categoryFeeBasisPoints: { calcados: 1600 },
  platformFeeBasisPoints: 400,
  estimatedShippingCents: 0,
};

describe("estimatedMarketplaceFeeCents", () => {
  it("uses the marketplace rate, or the category's when it has one", () => {
    expect(estimatedMarketplaceFeeCents({ priceCents: 10_000, costCents: 0 }, schedule)).toBe(1200);
    expect(
      estimatedMarketplaceFeeCents(
        { priceCents: 10_000, costCents: 0, categoryId: "calcados" },
        schedule,
      ),
    ).toBe(1600);
  });

  it("adds the shipping the reseller pays", () => {
    const withShipping = { ...schedule, estimatedShippingCents: 2_000 };
    expect(estimatedMarketplaceFeeCents({ priceCents: 10_000, costCents: 0 }, withShipping)).toBe(
      3200,
    );
  });
});

describe("estimateSale", () => {
  it("is the financial report's own formula, platform fee included", () => {
    const estimate = estimateSale({ priceCents: 10_000, costCents: 5_000 }, schedule);
    const report = computeOrderFinance(
      {
        status: "paid",
        totalCents: 10_000,
        marketplaceFeeCents: 1200,
        items: [{ quantity: 1, knownUnitCostCents: 5_000 }],
        adjustments: [],
      },
      400,
    );
    expect(estimate).toEqual(report);
    // 100,00 − 50,00 cost − 12,00 marketplace − 4,00 SellBridge.
    expect(estimate.profitCents).toBe(3_400);
  });
});

/** The answer by brute force: the first price from 1 cent up that keeps the margin. */
function smallestKeepingPrice(
  costCents: number,
  marginPercent: number,
  feeSchedule: FeeSchedule,
  categoryId: string | null = null,
): number {
  const keeps = (priceCents: number) =>
    estimateSale({ priceCents, costCents, categoryId }, feeSchedule).profitCents * 100 >=
    priceCents * marginPercent;
  let priceCents = 1;
  while (!keeps(priceCents)) {
    priceCents += 1;
  }
  return priceCents;
}

describe("priceForMargin", () => {
  it.each([0, 1, 999, 1_024, 1_030, 2_500, 4_990])(
    "is the smallest price keeping 20%% after every fee (cost %i)",
    (costCents) => {
      expect(priceForMargin({ costCents }, 20, schedule)).toBe(
        smallestKeepingPrice(costCents, 20, schedule),
      );
    },
  );

  it("finds R$ 16,60, not R$ 16,62, for 20% over R$ 10,30 at 14% + 4%", () => {
    // Searching down from the formula stopped at a gap the rounded fees leave at R$ 16,61.
    const usual = { ...schedule, marketplaceFeeBasisPoints: 1_400 };
    expect(priceForMargin({ costCents: 1_030 }, 20, usual)).toBe(1_660);
    expect(smallestKeepingPrice(1_030, 20, usual)).toBe(1_660);
  });

  it("finds the smallest price even where a higher price keeps less", () => {
    // 16,5% + 4%: at cost R$ 10,24, R$ 12,87 breaks even but R$ 12,88 does not.
    const uneven = { ...schedule, marketplaceFeeBasisPoints: 1_650 };
    expect(priceForMargin({ costCents: 1_024 }, 0, uneven)).toBe(
      smallestKeepingPrice(1_024, 0, uneven),
    );
  });

  it("counts the category rate and the shipping with a margin", () => {
    const shipped = { ...schedule, estimatedShippingCents: 1_000 };
    expect(priceForMargin({ costCents: 5_000, categoryId: "calcados" }, 10, shipped)).toBe(
      smallestKeepingPrice(5_000, 10, shipped, "calcados"),
    );
  });

  it("stays the smallest price when the fees leave almost nothing", () => {
    // 6% kept: one cent of rounded fee moves the answer by many cents of price.
    const heavy = { ...schedule, marketplaceFeeBasisPoints: 9_000, platformFeeBasisPoints: 0 };
    for (const costCents of [7, 333, 4_990]) {
      expect(priceForMargin({ costCents }, 4, heavy)).toBe(
        smallestKeepingPrice(costCents, 4, heavy),
      );
    }
  });

  it("is null exactly when the fees and the margin take the whole price", () => {
    expect(priceForMargin({ costCents: 1_000 }, 84, schedule)).toBeNull();
    expect(priceForMargin({ costCents: 1_000 }, 83.99, schedule)).not.toBeNull();
  });

  it("is null when the price would pass what a price can be", () => {
    expect(priceForMargin({ costCents: 2_000_000_000 }, 0, schedule)).toBeNull();
  });

  it.each([Number.NaN, -1, 100])("refuses a margin of %d%%", (marginPercent) => {
    expect(() => priceForMargin({ costCents: 1_000 }, marginPercent, schedule)).toThrow(
      "A margem deve ficar entre 0% e 100%",
    );
  });
});
