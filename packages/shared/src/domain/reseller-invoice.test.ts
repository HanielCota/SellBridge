import { describe, expect, it } from "vitest";
import { nextResellerInvoiceCheckAt } from "./reseller-invoice.ts";

const NOW = new Date("2026-11-19T12:00:00Z");

function minutesAfterNow(date: Date): number {
  return (date.getTime() - NOW.getTime()) / 60_000;
}

describe("nextResellerInvoiceCheckAt", () => {
  it("reads again in 5 minutes after the first read, doubling after each one", () => {
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(1, NOW))).toBe(5);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(2, NOW))).toBe(10);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(4, NOW))).toBe(40);
  });

  it("waits at most an hour between reads", () => {
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(5, NOW))).toBe(60);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(500, NOW))).toBe(60);
  });

  it("throws for a count that is not a positive integer", () => {
    for (const checks of [0, -1, 1.5, Number.NaN]) {
      expect(() => nextResellerInvoiceCheckAt(checks, NOW)).toThrow(RangeError);
    }
  });
});
