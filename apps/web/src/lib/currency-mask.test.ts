import { describe, expect, it } from "vitest";
import { formatCentsForField, maskCurrencyInput, readPastedCurrency } from "./currency-mask";

describe("maskCurrencyInput", () => {
  it("fills the cents first as digits are typed", () => {
    expect(maskCurrencyInput("1")).toBe("0,01");
    expect(maskCurrencyInput("12")).toBe("0,12");
    expect(maskCurrencyInput("1259")).toBe("12,59");
    expect(maskCurrencyInput("125990")).toBe("1.259,90");
  });

  it("reformats the field after each keystroke, separators included", () => {
    expect(maskCurrencyInput("125,905")).toBe("1.259,05");
    expect(maskCurrencyInput("1.259,9")).toBe("125,99");
  });

  it("accepts pasted amounts and ignores anything that is not a digit", () => {
    expect(maskCurrencyInput("R$ 1.259,90")).toBe("1.259,90");
    expect(maskCurrencyInput("0,50")).toBe("0,50");
  });

  it("empties when nothing is left and caps very long input", () => {
    expect(maskCurrencyInput("")).toBe("");
    expect(maskCurrencyInput("000")).toBe("");
    expect(maskCurrencyInput("12345678901")).toBe("1.234.567,89");
  });
});

describe("formatCentsForField", () => {
  it("writes cents with thousands and two decimals", () => {
    expect(formatCentsForField(12_590)).toBe("125,90");
    expect(formatCentsForField(125_990)).toBe("1.259,90");
  });
});

describe("readPastedCurrency", () => {
  // Regression: pasting "59.9" read "5,99" and "R$ 1.259,9" read "125,99".
  it.each([
    ["59.9", "59,90"],
    ["R$ 1.259,9", "1.259,90"],
    ["1.259,90", "1.259,90"],
    ["12", "12,00"],
    ["9.999.999,99", "9.999.999,99"],
  ])("reads %s as %s", (pasted, field) => {
    expect(readPastedCurrency(pasted)).toBe(field);
  });

  it.each(["", "abc", "0", "-5", "10.000.000,00", "1R2"])("refuses %j", (pasted) => {
    expect(readPastedCurrency(pasted)).toBeNull();
  });
});
