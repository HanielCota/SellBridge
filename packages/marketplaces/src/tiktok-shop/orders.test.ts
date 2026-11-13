import { describe, expect, it } from "vitest";
import { amountToCents } from "./orders.ts";

describe("amountToCents", () => {
  it("reads TikTok decimal amounts without float rounding", () => {
    expect(amountToCents("59.9", "total")).toBe(5990);
    expect(amountToCents("0.01", "total")).toBe(1);
    expect(amountToCents("5000", "total")).toBe(500_000);
    expect(amountToCents("19.99", "total")).toBe(1999);
  });

  it("refuses amounts outside the documented format", () => {
    for (const amount of ["", "-1", "1.234", "1,50", "abc", "NaN"]) {
      expect(() => amountToCents(amount, "total")).toThrow(/fora do formato/);
    }
  });

  it("refuses an amount larger than the stored column holds", () => {
    expect(() => amountToCents("999999999.99", "total")).toThrow(/acima do armazenável/);
  });
});
