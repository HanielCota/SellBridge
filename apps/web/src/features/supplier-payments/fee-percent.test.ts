import { describe, expect, test } from "vitest";
import { formatFeePercent, readFeePercent } from "./fee-percent.ts";

describe("formatFeePercent", () => {
  test("writes a whole rate without decimals", () => {
    expect(formatFeePercent(500)).toBe("5%");
  });

  test("writes a decimal rate with a comma", () => {
    expect(formatFeePercent(450)).toBe("4,5%");
  });
});

describe("readFeePercent", () => {
  test("reads a whole number", () => {
    expect(readFeePercent("5")).toEqual({ ok: true, basisPoints: 500 });
  });

  test("reads a decimal written with a comma", () => {
    expect(readFeePercent("4,5")).toEqual({ ok: true, basisPoints: 450 });
  });

  test("accepts the percent sign and spaces", () => {
    expect(readFeePercent(" 4.5 % ")).toEqual({ ok: true, basisPoints: 450 });
  });

  test("accepts zero", () => {
    expect(readFeePercent("0")).toEqual({ ok: true, basisPoints: 0 });
  });

  test("accepts the highest rate", () => {
    expect(readFeePercent("30")).toEqual({ ok: true, basisPoints: 3000 });
  });

  test("refuses a rate above 30%", () => {
    expect(readFeePercent("30,5")).toEqual({
      ok: false,
      message: "A taxa vai de 0 a 30%. Diminua o valor.",
    });
  });

  test("refuses an empty field with an example", () => {
    expect(readFeePercent("  ")).toEqual({ ok: false, message: "Escreva a taxa. Exemplo: 5" });
  });

  test("refuses two decimals and negative numbers", () => {
    expect(readFeePercent("4,55").ok).toBe(false);
    expect(readFeePercent("-1").ok).toBe(false);
  });
});
