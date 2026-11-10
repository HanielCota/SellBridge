import { describe, expect, it } from "vitest";
import {
  formatResellerDiscount,
  parseResellerDiscount,
  resellerPriceFromDiscount,
} from "./erp-reseller-price.ts";

describe("parseResellerDiscount", () => {
  it("reads a whole percentage and one decimal with a comma, a dot or a percent sign", () => {
    expect(parseResellerDiscount("30")).toEqual({ ok: true, tenths: 300 });
    expect(parseResellerDiscount(" 30,5 ")).toEqual({ ok: true, tenths: 305 });
    expect(parseResellerDiscount("12.5%")).toEqual({ ok: true, tenths: 125 });
    expect(parseResellerDiscount("0")).toEqual({ ok: true, tenths: 0 });
    expect(parseResellerDiscount("90")).toEqual({ ok: true, tenths: 900 });
  });

  it("refuses more than 90% and names the value", () => {
    expect(parseResellerDiscount("95")).toEqual({
      ok: false,
      message: "O desconto pode ser de 0 a 90% (recebido: 95%).",
    });
  });

  it("refuses text, negatives, blanks and two decimals with the value typed", () => {
    for (const typed of ["abc", "-10", "", "30,55", "NaN"]) {
      const parsed = parseResellerDiscount(typed);

      expect(parsed.ok).toBe(false);
    }
    expect(parseResellerDiscount("abc")).toMatchObject({
      message: expect.stringContaining('"abc"'),
    });
  });
});

describe("resellerPriceFromDiscount", () => {
  it("takes the discount off the ERP price, rounded to the cent", () => {
    expect(resellerPriceFromDiscount(3990, 300)).toBe(2793);
    expect(resellerPriceFromDiscount(6990, 305)).toBe(4858);
    expect(resellerPriceFromDiscount(3990, 0)).toBe(3990);
  });

  it("never goes below one cent", () => {
    expect(resellerPriceFromDiscount(1, 900)).toBe(1);
  });

  it("has no price without a usable ERP price or discount", () => {
    expect(resellerPriceFromDiscount(null, 300)).toBeNull();
    expect(resellerPriceFromDiscount(0, 300)).toBeNull();
    expect(resellerPriceFromDiscount(-100, 300)).toBeNull();
    expect(resellerPriceFromDiscount(Number.NaN, 300)).toBeNull();
    expect(resellerPriceFromDiscount(3990, 950)).toBeNull();
    expect(resellerPriceFromDiscount(3990, Number.NaN)).toBeNull();
  });
});

describe("formatResellerDiscount", () => {
  it("shows tenths as the supplier types them", () => {
    expect(formatResellerDiscount(300)).toBe("30");
    expect(formatResellerDiscount(305)).toBe("30,5");
  });
});
