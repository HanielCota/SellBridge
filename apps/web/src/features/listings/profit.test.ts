import { DEFAULT_FEE_SCHEDULE } from "@sellbridge/shared/fee-model";
import { shippingBandsFromQuotes } from "@sellbridge/shared/mercado-livre-shipping";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SALE_CHANNELS,
  estimateProfit,
  isLowStock,
  isThinMargin,
  marginShortcutPrices,
  minimumPrice,
  saleChannelsOf,
  shelfPriceForMargin,
  wholeMarginPercent,
  priceForMargin,
} from "./profit";

/** Today's 14% commission. */
const schedule = DEFAULT_FEE_SCHEDULE;
const mercadoLivre = DEFAULT_SALE_CHANNELS;

/** The client's product of the 15/11/2026 report: R$ 21,00 of cost, up to 0,3 kg. */
const clientProduct = { costCents: 2_100, weightGrams: 300 };

describe("estimateProfit", () => {
  it("returns null when there is no price", () => {
    expect(estimateProfit(null, { costCents: 1000 }, schedule, mercadoLivre)).toBeNull();
    expect(estimateProfit(0, { costCents: 1000 }, schedule, mercadoLivre)).toBeNull();
  });

  // Regression: the catalog showed a 24% margin on this sale, counting no shipping.
  it("shows the client's R$ 33,90 Mercado Livre sale at R$ 1,30, a 3% margin", () => {
    const estimate = estimateProfit(3_390, clientProduct, DEFAULT_FEE_SCHEDULE, mercadoLivre);

    expect(estimate).toEqual({
      channel: "mercado_livre",
      feeCents: 475 + 685,
      profitCents: 130,
      marginPercent: 3.8,
    });
    expect(wholeMarginPercent(estimate?.marginPercent ?? 0)).toBe(3);
  });

  it("subtracts cost, the commission and the shipping, and no SellBridge fee", () => {
    // 100,00 − 50,00 − 14,00 commission − 16,15 shipping (0,5 kg).
    expect(estimateProfit(10_000, { costCents: 5000 }, schedule, mercadoLivre)?.profitCents).toBe(
      1_985,
    );
  });

  it("reports negative profit when the price does not cover costs", () => {
    // 50,00 − 50,00 − 7,00 commission − 8,25 shipping (0,5 kg).
    expect(estimateProfit(5000, { costCents: 5000 }, schedule, mercadoLivre)?.profitCents).toBe(
      -1_525,
    );
  });

  it("shows the channel that leaves the least when the price sells on several", () => {
    const estimate = estimateProfit(3_390, clientProduct, DEFAULT_FEE_SCHEDULE, [
      "tiktok_shop",
      "mercado_livre",
    ]);

    expect(estimate?.channel).toBe("mercado_livre");
    expect(estimate?.profitCents).toBe(130);
  });
});

describe("priceForMargin", () => {
  it("prices so the profit is the asked share of the sale, every fee counted", () => {
    const price = priceForMargin({ costCents: 5814 }, 30, schedule, mercadoLivre) ?? 0;
    const profitAt = (priceCents: number) =>
      estimateProfit(priceCents, { costCents: 5814 }, schedule, mercadoLivre)?.profitCents ?? 0;

    expect(profitAt(price) * 100).toBeGreaterThanOrEqual(price * 30);
    expect(profitAt(price - 1) * 100).toBeLessThan((price - 1) * 30);
  });

  it("asks the highest price when the product sells on several channels", () => {
    const both = priceForMargin(clientProduct, 20, schedule, ["tiktok_shop", "mercado_livre"]);

    expect(both).toBe(priceForMargin(clientProduct, 20, schedule, mercadoLivre));
  });

  it("returns null when the fees leave no room for the margin", () => {
    expect(priceForMargin({ costCents: 5000 }, 86, schedule, mercadoLivre)).toBeNull();
  });
});

describe("shelfPriceForMargin", () => {
  // Regression: rounding R$ 18,96 up to R$ 19,90 crossed into the next shipping band, and the
  // "25%" shortcut of the price dialog set a price that kept only 21%.
  it("skips a ,90 price that crosses into a band with more shipping", () => {
    const product = { costCents: 591, weightGrams: 300 };
    const profitAt = (priceCents: number) =>
      estimateProfit(priceCents, product, DEFAULT_FEE_SCHEDULE, mercadoLivre)?.profitCents ?? 0;

    const price = shelfPriceForMargin(product, 25, DEFAULT_FEE_SCHEDULE, mercadoLivre);

    expect(profitAt(1_990) * 100).toBeLessThan(1_990 * 25);
    expect(price).toBe(2_190);
    expect(profitAt(2_190) * 100).toBeGreaterThanOrEqual(2_190 * 25);
  });

  it("keeps a price that already ends in ,90", () => {
    const exact = priceForMargin(clientProduct, 20, DEFAULT_FEE_SCHEDULE, mercadoLivre);

    expect(exact).toBe(4_220);
    expect(shelfPriceForMargin(clientProduct, 20, DEFAULT_FEE_SCHEDULE, mercadoLivre)).toBe(4_290);
  });

  it("is null when no price keeps the margin", () => {
    expect(shelfPriceForMargin({ costCents: 5000 }, 86, schedule, mercadoLivre)).toBeNull();
  });
});

describe("minimumPrice", () => {
  it("is the client's break-even R$ 32,38 on Mercado Livre", () => {
    expect(minimumPrice(clientProduct, DEFAULT_FEE_SCHEDULE, mercadoLivre)).toBe(3_238);
  });
});

describe("saleChannelsOf", () => {
  it("lists each store's channel once, the mock store charging like Mercado Livre", () => {
    expect(
      saleChannelsOf([
        { marketplace: "mock" },
        { marketplace: "mercado_livre" },
        { marketplace: "tiktok_shop" },
      ]),
    ).toEqual(["mercado_livre", "tiktok_shop"]);
  });

  it("falls back to Mercado Livre with no store", () => {
    expect(saleChannelsOf([])).toEqual(["mercado_livre"]);
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
});

describe("wholeMarginPercent", () => {
  // Regression: 14.9% showed as "15%" while painted as a thin (under 15%) margin.
  it("rounds down so the number agrees with the thin-margin color", () => {
    expect(wholeMarginPercent(14.9)).toBe(14);
    expect(isThinMargin(14.9)).toBe(true);
    expect(wholeMarginPercent(15)).toBe(15);
    expect(wholeMarginPercent(-3.4)).toBe(-4);
  });
});

describe("with the store's own Mercado Livre rates", () => {
  /** A store that pays R$ 10,00 of shipping between R$ 19 and R$ 48,99, not the table's R$ 6,85. */
  const storeRates = {
    commissionBasisPoints: 1_400,
    shippingBands: shippingBandsFromQuotes([600, 1_000, 1_100, 1_500, 1_700, 1_900, 2_100, 2_400]),
  };

  it("shows the profit the store really leaves", () => {
    const estimate = estimateProfit(
      3_390,
      { ...clientProduct, mercadoLivreRates: storeRates },
      DEFAULT_FEE_SCHEDULE,
      mercadoLivre,
    );

    expect(estimate?.feeCents).toBe(475 + 1_000);
    expect(estimate?.profitCents).toBe(-185);
  });

  it("raises the lowest price with the store's shipping", () => {
    const withStore = minimumPrice(
      { ...clientProduct, mercadoLivreRates: storeRates },
      DEFAULT_FEE_SCHEDULE,
      mercadoLivre,
    );
    const withTable = minimumPrice(clientProduct, DEFAULT_FEE_SCHEDULE, mercadoLivre);

    expect(withTable).toBe(3_238);
    expect(withStore).toBe(3_605);
  });
});

describe("marginShortcutPrices", () => {
  // Regression: a new listing offered "Margem 40%" at R$ 108,59 while the price dialog offered
  // 40% at R$ 108,90, and the two screens did not even offer the same margins.
  it("offers 25%, 40% and 55% at prices ending in ,90 that keep each margin", () => {
    const serum = { costCents: 3_500, weightGrams: 120 };

    const shortcuts = marginShortcutPrices(serum, schedule, mercadoLivre);

    expect(shortcuts.map((shortcut) => shortcut.marginPercent)).toEqual([25, 40, 55]);
    for (const { marginPercent, priceCents } of shortcuts) {
      expect(priceCents).toBe(shelfPriceForMargin(serum, marginPercent, schedule, mercadoLivre));
      expect((priceCents ?? 0) % 100).toBe(90);
      expect(
        estimateProfit(priceCents, serum, schedule, mercadoLivre)?.marginPercent,
      ).toBeGreaterThanOrEqual(marginPercent);
    }
  });
});
