import { describe, expect, it } from "vitest";
import {
  marketplaceUnits,
  MAX_SENT_UNITS,
  SHOPEE_SHOWCASE_DEFAULT_UNITS,
  SHOPEE_SHOWCASE_MAX_UNITS,
  showcaseMargin,
} from "./marketplace-units.ts";

const showcaseUnits = SHOPEE_SHOWCASE_DEFAULT_UNITS;

describe("marketplaceUnits", () => {
  it.each([
    [0, 0],
    [1, 1001],
    [50, 1050],
    [500, 1500],
  ])("sends %i real Shopee units as %i", (realUnits, sent) => {
    expect(marketplaceUnits({ marketplace: "shopee", realUnits, showcaseUnits })).toBe(sent);
  });

  it("sends 0 to Shopee when the listing is paused or the product inactive (0 real units)", () => {
    // Pause and inactivity already turn the real units into 0 before this rule runs.
    expect(marketplaceUnits({ marketplace: "shopee", realUnits: 0, showcaseUnits: 5000 })).toBe(0);
  });

  it("sends only the real units when the showcase is turned off", () => {
    expect(marketplaceUnits({ marketplace: "shopee", realUnits: 50, showcaseUnits: 0 })).toBe(50);
  });

  it.each(["mercado_livre", "mock", "tiktok_shop"] as const)(
    "leaves %s with the real units",
    (marketplace) => {
      expect(marketplaceUnits({ marketplace, realUnits: 50, showcaseUnits })).toBe(50);
      expect(marketplaceUnits({ marketplace, realUnits: 0, showcaseUnits })).toBe(0);
    },
  );

  it("never sends more than the stock column holds", () => {
    expect(
      marketplaceUnits({ marketplace: "shopee", realUnits: 2_147_483_600, showcaseUnits: 100_000 }),
    ).toBe(MAX_SENT_UNITS);
    expect(MAX_SENT_UNITS).toBe(2_147_483_647);
  });

  it.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    "refuses %s real units instead of sending them",
    (realUnits) => {
      expect(() => marketplaceUnits({ marketplace: "shopee", realUnits, showcaseUnits })).toThrow(
        expect.objectContaining({ code: "VALIDATION" }),
      );
    },
  );
});

describe("showcaseMargin", () => {
  it("accepts 0 through the maximum", () => {
    expect(showcaseMargin(0)).toBe(0);
    expect(showcaseMargin(SHOPEE_SHOWCASE_MAX_UNITS)).toBe(100_000);
  });

  it.each([-1, 1.5, Number.NaN, SHOPEE_SHOWCASE_MAX_UNITS + 1])(
    "refuses a showcase of %s",
    (units) => {
      expect(() => showcaseMargin(units)).toThrow(
        expect.objectContaining({ code: "CONFIGURATION" }),
      );
    },
  );
});
