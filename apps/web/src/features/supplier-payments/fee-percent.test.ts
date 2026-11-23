import { describe, expect, test } from "vitest";
import { formatFeePercent } from "./fee-percent.ts";

describe("formatFeePercent", () => {
  test("writes a whole rate without decimals", () => {
    expect(formatFeePercent(500)).toBe("5%");
  });

  test("writes a decimal rate with a comma", () => {
    expect(formatFeePercent(450)).toBe("4,5%");
  });
});
