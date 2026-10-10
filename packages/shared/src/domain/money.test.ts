import { describe, expect, it } from "vitest";
import {
  assertCents,
  formatCents,
  formatCentsForInput,
  parseBrlToCents,
  parseOptionalBrlToCents,
  percentChange,
  percentOfCents,
} from "./money.ts";

describe("money", () => {
  it("formats cents as BRL", () => {
    expect(formatCents(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });

  it("rejects non-integer cents", () => {
    expect(() => assertCents(10.5)).toThrow("inteiro em centavos");
  });

  it.each([
    ["1.234,56", 123456],
    ["1234,5", 123450],
    ["12", 1200],
    ["R$ 0,99", 99],
    ["-3,10", -310],
  ])("parses %s", (input, expected) => {
    expect(parseBrlToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1,234", "12,345"])("returns null for invalid input %j", (input) => {
    expect(parseBrlToCents(input)).toBeNull();
  });

  it("applies basis points with rounding", () => {
    expect(percentOfCents(1000, 1250)).toBe(125);
    expect(percentOfCents(999, 1000)).toBe(100);
  });

  it("computes percent change and handles zero base", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });

  it("formats cents for a BRL input field", () => {
    expect(formatCentsForInput(123456)).toBe("1234,56");
    expect(formatCentsForInput(990)).toBe("9,90");
    expect(formatCentsForInput(0)).toBe("0,00");
    expect(formatCentsForInput(undefined)).toBe("");
  });

  it.each([
    ["", undefined],
    ["   ", undefined],
    ["abc", undefined],
    ["-5,00", undefined],
    ["12,50", 1250],
    ["0", 0],
  ])("parses optional input %j", (input, expected) => {
    expect(parseOptionalBrlToCents(input)).toBe(expected);
  });
});
