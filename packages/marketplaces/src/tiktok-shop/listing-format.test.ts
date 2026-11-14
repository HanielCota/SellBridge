import { describe, expect, it } from "vitest";
import { descriptionHtml, priceAmount } from "./listings.ts";

describe("priceAmount", () => {
  it("writes cents as the decimal text TikTok takes", () => {
    expect(priceAmount(5990)).toBe("59.90");
    expect(priceAmount(5)).toBe("0.05");
    expect(priceAmount(123_400)).toBe("1234.00");
  });

  it("refuses zero, negative and fractional cents", () => {
    expect(() => priceAmount(0)).toThrow(/maior que zero/);
    expect(() => priceAmount(-100)).toThrow(/maior que zero/);
    expect(() => priceAmount(10.5)).toThrow(/inteiro em centavos/);
  });
});

describe("descriptionHtml", () => {
  it("turns each non-empty line into an escaped paragraph", () => {
    expect(descriptionHtml('Linha 1\n\n <b>"2"</b> ')).toBe(
      "<p>Linha 1</p><p>&lt;b&gt;&quot;2&quot;&lt;/b&gt;</p>",
    );
  });

  it("refuses a description longer than TikTok accepts once written as HTML", () => {
    expect(() => descriptionHtml("a".repeat(10_000))).toThrow(/10\.000 caracteres/);
  });
});
