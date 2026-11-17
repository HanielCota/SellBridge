import { describe, expect, it } from "vitest";
import type { FeeChannel } from "./channel-fees.ts";
import {
  assertPriceKeepsMargin,
  DEFAULT_FEE_SCHEDULE,
  estimatedMarketplaceFeeCents,
  estimateSale,
  estimateSaleFees,
  type FeeSchedule,
  assertBatchKeepsMargin,
  batchPriceProblem,
  minimumPriceCents,
  onChannel,
  priceFloorProblemOnChannels,
  priceForMargin,
} from "./fee-model.ts";
import { computeOrderFinance } from "./finance.ts";

const schedule: FeeSchedule = {
  ...DEFAULT_FEE_SCHEDULE,
  marketplaceFeeBasisPoints: 1200,
  categoryFeeBasisPoints: { calcados: 1600 },
  platformFeeBasisPoints: 400,
};

/** The client's product: R$ 21,00 of cost, light enough for the first weight band. */
const clientProduct = { costCents: 2_100, weightGrams: 300 };
const clientSchedule: FeeSchedule = { ...DEFAULT_FEE_SCHEDULE, marketplaceFeeBasisPoints: 1_400 };

describe("estimateSale on the client's product (report of 15/11/2026)", () => {
  it("leaves R$ 1,30 of a R$ 33,90 Mercado Livre sale after commission and shipping", () => {
    const sale = estimateSale({ ...clientProduct, priceCents: 3_390 }, clientSchedule);

    expect(sale.feeCents).toBe(475 + 685);
    expect(sale.profitCents).toBe(130);
  });

  it("loses R$ 0,42 at the R$ 31,90 the supplier suggested", () => {
    const sale = estimateSale({ ...clientProduct, priceCents: 3_190 }, clientSchedule);

    expect(sale.profitCents).toBe(-42);
  });

  it("leaves R$ 3,48 of the same sale on TikTok Shop", () => {
    const tiktok = onChannel(clientSchedule, "tiktok_shop");

    expect(estimateSale({ ...clientProduct, priceCents: 3_390 }, tiktok).profitCents).toBe(348);
  });
});

describe("estimateSaleFees", () => {
  it("uses the default weight when the product has none", () => {
    const withoutWeight = estimateSaleFees(
      { priceCents: 3_390, costCents: 2_100, weightGrams: null },
      clientSchedule,
    );

    expect(withoutWeight.shippingCents).toBe(695);
  });

  it("uses the category's Mercado Livre rate when it has one", () => {
    const fees = estimateSaleFees(
      { priceCents: 10_000, costCents: 0, categoryId: "calcados" },
      schedule,
    );

    expect(fees.commissionCents).toBe(1_600);
  });
});

describe("estimateSale", () => {
  it("is the financial report's own formula, platform fee included", () => {
    const input = { priceCents: 10_000, costCents: 5_000 };
    const marketplaceFeeCents = estimatedMarketplaceFeeCents(input, schedule);

    const estimate = estimateSale(input, schedule);
    const report = computeOrderFinance(
      {
        status: "paid",
        totalCents: 10_000,
        marketplaceFeeCents,
        items: [{ quantity: 1, knownUnitCostCents: 5_000 }],
        adjustments: [],
      },
      400,
    );

    expect(estimate).toEqual(report);
    // 100,00 − 50,00 cost − 12,00 commission − 16,15 shipping (0,5 kg) − 4,00 SellBridge.
    expect(estimate.profitCents).toBe(10_000 - 5_000 - 1_200 - 1_615 - 400);
  });
});

interface BruteForceCase {
  costCents: number;
  marginPercent: number;
  feeSchedule: FeeSchedule;
  categoryId?: string | null;
  weightGrams?: number | null;
}

/** The answer by brute force: the first price from 1 cent up that keeps the margin. */
function smallestKeepingPrice(search: BruteForceCase): number {
  const keeps = (priceCents: number) =>
    estimateSale(
      {
        priceCents,
        costCents: search.costCents,
        categoryId: search.categoryId ?? null,
        weightGrams: search.weightGrams ?? null,
      },
      search.feeSchedule,
    ).profitCents *
      100 >=
    priceCents * search.marginPercent;
  let priceCents = 1;
  while (!keeps(priceCents)) {
    priceCents += 1;
  }
  return priceCents;
}

describe("priceForMargin", () => {
  const channels: readonly FeeChannel[] = ["mercado_livre", "tiktok_shop", "shopee"];

  it.each(channels)("is the smallest price keeping 0% and 20%% on %s", (channel) => {
    const onIt = onChannel(schedule, channel);
    for (const costCents of [0, 1, 999, 1_024, 1_030, 2_100, 2_500, 4_990, 6_500]) {
      for (const marginPercent of [0, 20]) {
        expect(priceForMargin({ costCents }, marginPercent, onIt)).toBe(
          smallestKeepingPrice({ costCents, marginPercent, feeSchedule: onIt }),
        );
      }
    }
  });

  it("finds R$ 42,20 for 20% over the client's R$ 21,00 on Mercado Livre", () => {
    expect(priceForMargin(clientProduct, 20, clientSchedule)).toBe(4_220);
  });

  it("stays under R$ 79 when the next shipping band would cost more than it adds", () => {
    // From R$ 79 the shipping jumps from R$ 8,15 to R$ 12,95 for a light item.
    const costCents = 5_000;
    const found = priceForMargin({ costCents, weightGrams: 300 }, 18, clientSchedule);

    expect(found).toBe(
      smallestKeepingPrice({
        costCents,
        marginPercent: 18,
        feeSchedule: clientSchedule,
        weightGrams: 300,
      }),
    );
  });

  it("counts the category rate and the weight with a margin", () => {
    expect(
      priceForMargin(
        { costCents: 5_000, categoryId: "calcados", weightGrams: 2_500 },
        10,
        schedule,
      ),
    ).toBe(
      smallestKeepingPrice({
        costCents: 5_000,
        marginPercent: 10,
        feeSchedule: schedule,
        categoryId: "calcados",
        weightGrams: 2_500,
      }),
    );
  });

  it("stays the smallest price when the fees leave almost nothing", () => {
    // 6% kept: one cent of rounded fee moves the answer by many cents of price.
    const heavy = { ...schedule, marketplaceFeeBasisPoints: 9_000, platformFeeBasisPoints: 0 };
    for (const costCents of [7, 333, 4_990]) {
      expect(priceForMargin({ costCents }, 4, heavy)).toBe(
        smallestKeepingPrice({ costCents, marginPercent: 4, feeSchedule: heavy }),
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
      smallestKeepingPrice({ costCents: 5_000, marginPercent: 0, feeSchedule: schedule }),
    );
  });

  it("is R$ 32,38 for the client's product on Mercado Livre", () => {
    expect(minimumPriceCents(clientProduct, clientSchedule)).toBe(3_238);
  });

  it("keeps the configured minimum margin", () => {
    const strict = { ...schedule, minimumMarginPercent: 10 };
    expect(minimumPriceCents({ costCents: 5_000 }, strict)).toBe(
      smallestKeepingPrice({ costCents: 5_000, marginPercent: 10, feeSchedule: strict }),
    );
  });

  it("still covers the shipping when no commission is charged", () => {
    const free = { ...schedule, marketplaceFeeBasisPoints: 0, platformFeeBasisPoints: 0 };

    // R$ 50,00 of cost plus R$ 8,25 of shipping (0,5 kg, R$ 49 to R$ 78,99).
    expect(minimumPriceCents({ costCents: 5_000 }, free)).toBe(5_825);
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
      /Com as taxas do Mercado Livre, o preço mínimo para não ter prejuízo é R\$\s[\d.,]+/,
    );
    expect(() => assertPriceKeepsMargin(minimum, { costCents: 5_000 }, schedule)).not.toThrow();
  });

  it("refuses the client's R$ 31,90 on Mercado Livre", () => {
    expect(() => assertPriceKeepsMargin(3_190, clientProduct, clientSchedule)).toThrow(
      /Com as taxas do Mercado Livre, o preço mínimo para não ter prejuízo é R\$\s32,38/,
    );
  });

  it("checks every channel the price will sell on and names the one it does not pay", () => {
    // R$ 32,00 pays on TikTok and Shopee, but not on Mercado Livre (floor R$ 32,38).
    expect(() =>
      assertPriceKeepsMargin(3_200, clientProduct, clientSchedule, ["tiktok_shop", "shopee"]),
    ).not.toThrow();
    expect(
      priceFloorProblemOnChannels(3_200, clientProduct, clientSchedule, [
        "tiktok_shop",
        "mercado_livre",
      ]),
    ).toMatch(/^Com as taxas do Mercado Livre/);
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
      "As taxas do Mercado Livre e a margem mínima de 84% não deixam um preço possível para este produto",
    );
  });

  it("refuses every price when the fees leave nothing", () => {
    const greedy = { ...schedule, marketplaceFeeBasisPoints: 9_600 };
    expect(() => assertPriceKeepsMargin(999_999, { costCents: 5_000 }, greedy)).toThrow(
      "As taxas do Mercado Livre não deixam lucro para este produto",
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
      /^"Batom": Com as taxas do Mercado Livre, o preço mínimo para não ter prejuízo é R\$\s[\d.,]+\. Ajuste a regra de preço\.$/,
    );
  });

  it("checks the batch on every channel of the chosen stores", () => {
    const batch = [{ title: "Batom", priceCents: 3_200, ...clientProduct }];

    expect(batchPriceProblem(batch, clientSchedule, ["shopee"])).toBeNull();
    expect(batchPriceProblem(batch, clientSchedule, ["shopee", "mercado_livre"])).toMatch(
      /^"Batom": Com as taxas do Mercado Livre/,
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
