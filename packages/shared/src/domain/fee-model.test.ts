import { describe, expect, it } from "vitest";
import {
  assertPriceKeepsMargin,
  DEFAULT_FEE_SCHEDULE,
  estimatedMarketplaceFeeCents,
  estimateSale,
  type FeeSchedule,
  assertBatchKeepsMargin,
  batchPriceProblem,
  minimumPriceCents,
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

  // Regression: a R$ 950.000 cost asked for a R$ 1.104.651 floor, a price no listing may have.
  it("is null when the price would pass what a listing may charge", () => {
    expect(priceForMargin({ costCents: 95_000_000 }, 0, schedule)).toBeNull();
    const highest = priceForMargin({ costCents: 80_000_000 }, 0, schedule);
    expect(highest).not.toBeNull();
    expect(highest ?? Infinity).toBeLessThanOrEqual(100_000_000);
  });

  it.each([Number.NaN, -1, 100])("refuses a margin of %d%%", (marginPercent) => {
    expect(() => priceForMargin({ costCents: 1_000 }, marginPercent, schedule)).toThrow(
      "A margem deve ficar entre 0% e 100%",
    );
  });
});

describe("minimumPriceCents", () => {
  it("is the break-even price after every fee when no margin is asked", () => {
    expect(minimumPriceCents({ costCents: 5_000 }, schedule)).toBe(
      smallestKeepingPrice(5_000, 0, schedule),
    );
  });

  it("keeps the configured minimum margin", () => {
    const strict = { ...schedule, minimumMarginPercent: 10 };
    expect(minimumPriceCents({ costCents: 5_000 }, strict)).toBe(
      smallestKeepingPrice(5_000, 10, strict),
    );
  });

  it("stays above the cost even when nothing is charged", () => {
    const free = { ...schedule, marketplaceFeeBasisPoints: 0, platformFeeBasisPoints: 0 };
    expect(minimumPriceCents({ costCents: 5_000 }, free)).toBe(5_001);
  });

  it("is null when the fees take the whole price", () => {
    const greedy = { ...schedule, marketplaceFeeBasisPoints: 9_600 };
    expect(minimumPriceCents({ costCents: 5_000 }, greedy)).toBeNull();
  });
});

describe("assertPriceKeepsMargin", () => {
  it("refuses a price above the cost that loses money after the fees", () => {
    const minimum = minimumPriceCents({ costCents: 5_000 }, schedule) ?? 0;
    expect(() => assertPriceKeepsMargin(minimum - 1, { costCents: 5_000 }, schedule)).toThrow(
      /Com as taxas, o preço mínimo para não ter prejuízo é R\$\s[\d.,]+/,
    );
    expect(() => assertPriceKeepsMargin(minimum, { costCents: 5_000 }, schedule)).not.toThrow();
  });

  it("names the minimum margin when one is configured", () => {
    const strict = { ...schedule, minimumMarginPercent: 10 };
    expect(() => assertPriceKeepsMargin(6_000, { costCents: 5_000 }, strict)).toThrow(
      /preço mínimo para 10% de margem/,
    );
  });

  it("says when the minimum margin, not the fees alone, leaves no possible price", () => {
    const strict = { ...schedule, minimumMarginPercent: 84 };
    expect(() => assertPriceKeepsMargin(999_999, { costCents: 5_000 }, strict)).toThrow(
      "As taxas e a margem mínima de 84% não deixam um preço possível para este produto",
    );
  });

  it("refuses every price when the fees leave nothing", () => {
    const greedy = { ...schedule, marketplaceFeeBasisPoints: 9_600 };
    expect(() => assertPriceKeepsMargin(999_999, { costCents: 5_000 }, greedy)).toThrow(
      "As taxas configuradas não deixam lucro para este produto",
    );
  });
});

describe("batchPriceProblem", () => {
  // Regression: a 300% markup on a R$ 300.000 cost (R$ 1.200.000) passed the screen's check and
  // was only refused by the server.
  it("names a product whose rule passes the listing ceiling", () => {
    const batch = [
      { title: "Joia", priceCents: 100_000_000, costCents: 30_000_000 },
      { title: "Relógio", priceCents: 100_000_001, costCents: 30_000_000 },
    ];
    expect(batchPriceProblem(batch, schedule)).toMatch(
      /^"Relógio": O preço de venda pode ser de até/,
    );
  });

  it("names the first product of a batch whose price loses money after the fees", () => {
    const minimum = minimumPriceCents({ costCents: 5_000 }, schedule) ?? 0;
    const batch = [
      { title: "Sérum", priceCents: minimum, costCents: 5_000 },
      { title: "Batom", priceCents: minimum - 1, costCents: 5_000 },
      { title: "Base", priceCents: 1, costCents: 5_000 },
    ];
    expect(batchPriceProblem(batch, schedule)).toMatch(
      /^"Batom": Com as taxas, o preço mínimo para não ter prejuízo é R\$\s[\d.,]+\. Ajuste a regra de preço\.$/,
    );
  });

  it("is null when every price keeps the margin", () => {
    expect(
      batchPriceProblem([{ title: "Sérum", priceCents: 99_999, costCents: 5_000 }], schedule),
    ).toBeNull();
  });

  it("refuses the whole batch as a conflict, like one listing at a time", () => {
    const batch = [{ title: "Batom", priceCents: 5_001, costCents: 5_000 }];
    expect(() => assertBatchKeepsMargin(batch, schedule)).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
  });
});
