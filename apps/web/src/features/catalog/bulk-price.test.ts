import { DEFAULT_FEE_SCHEDULE } from "@sellbridge/shared/fee-model";
import { describe, expect, it } from "vitest";
import { DEFAULT_SALE_CHANNELS, estimateProfit } from "@/features/listings/profit";
import { bulkPriceCents, unreachableMarginMessage } from "./bulk-price";

const schedule = DEFAULT_FEE_SCHEDULE;
const mercadoLivre = DEFAULT_SALE_CHANNELS;

/** The face cream of the 17/11/2026 walkthrough: R$ 29,90 of cost, 150 g. */
const faceCream = { costCents: 2_990, weightGrams: 150, suggestedPriceCents: 4_990 };

describe("bulkPriceCents", () => {
  // Regression: "Custo + margem 60%" priced it at R$ 47,90, which left the reseller only 9%.
  it("prices a 30% margin so that 30% of the sale is left after every fee", () => {
    const priceCents = bulkPriceCents(
      faceCream,
      { kind: "margin", percent: 30 },
      schedule,
      mercadoLivre,
    );

    const estimate = estimateProfit(priceCents, faceCream, schedule, mercadoLivre);
    expect(priceCents).not.toBeNull();
    expect(estimate?.marginPercent).toBeGreaterThanOrEqual(30);
    expect((priceCents ?? 0) % 100).toBe(90);
  });

  it("keeps the supplier's suggested price for the suggested rule", () => {
    const priceCents = bulkPriceCents(faceCream, { kind: "suggested" }, schedule, mercadoLivre);

    expect(priceCents).toBe(4_990);
  });

  it("returns null when the fees alone already take the margin asked", () => {
    const costly = { ...DEFAULT_FEE_SCHEDULE, platformFeeBasisPoints: 2_500 };

    const priceCents = bulkPriceCents(
      faceCream,
      { kind: "margin", percent: 80 },
      costly,
      mercadoLivre,
    );

    expect(priceCents).toBeNull();
  });
});

describe("unreachableMarginMessage", () => {
  it("names the product and the margin to lower", () => {
    const message = unreachableMarginMessage("Hidratante 50g", 80);

    expect(message).toBe(
      'As taxas não deixam 80% de lucro em "Hidratante 50g". Escolha uma margem menor.',
    );
  });
});
