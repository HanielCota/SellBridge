import { describe, expect, it } from "vitest";
import {
  mercadoLivreShippingBands,
  shippingBandsFromQuotes,
  shippingQuotePricesCents,
} from "./mercado-livre-shipping.ts";

describe("shippingQuotePricesCents", () => {
  it("asks each band at its last price and the open band at its first", () => {
    expect(shippingQuotePricesCents()).toEqual([
      1_899, 4_899, 7_899, 9_999, 11_999, 14_999, 19_999, 20_000,
    ]);
  });

  it("asks one price inside every band of the table", () => {
    const bands = mercadoLivreShippingBands(300);

    const inside = shippingQuotePricesCents().every((price, index) => {
      const band = bands[index];
      return band !== undefined && price >= band.fromCents && price <= band.toCents;
    });

    expect(inside).toBe(true);
  });
});

describe("shippingBandsFromQuotes", () => {
  it("lays the quoted costs on the table's price bands", () => {
    const bands = shippingBandsFromQuotes([600, 1_000, 1_100, 1_500, 1_700, 1_900, 2_100, 2_400]);

    expect(bands[1]).toEqual({ fromCents: 1_900, toCents: 4_899, shippingCents: 1_000 });
    expect(bands.at(-1)).toEqual({
      fromCents: 20_000,
      toCents: Number.MAX_SAFE_INTEGER,
      shippingCents: 2_400,
    });
  });

  it("refuses a quote list with a band missing", () => {
    expect(() => shippingBandsFromQuotes([600, 1_000])).toThrow("2 shipping costs for 8");
  });

  it("refuses a negative or fractional cost", () => {
    expect(() =>
      shippingBandsFromQuotes([600, -1, 1_100, 1_500, 1_700, 1_900, 2_100, 2_400]),
    ).toThrow("price band 1");
    expect(() =>
      shippingBandsFromQuotes([600, 10.5, 1_100, 1_500, 1_700, 1_900, 2_100, 2_400]),
    ).toThrow("price band 1");
  });
});
