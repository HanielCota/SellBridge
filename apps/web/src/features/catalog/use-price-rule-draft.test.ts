import { describe, expect, it } from "vitest";
import { parseMarginPercent } from "./use-price-rule-draft";

describe("parseMarginPercent", () => {
  it.each([
    ["5", 5],
    ["80", 80],
    [" 30 ", 30],
  ])("accepts %j", (typed, percent) => {
    expect(parseMarginPercent(typed)).toEqual({ kind: "margin", percent });
  });

  it.each(["4", "81", "12.5", "12,5", "30abc", "", "-10", "1e2", "99999"])(
    "refuses %j instead of reading part of it",
    (typed) => {
      expect(parseMarginPercent(typed)).toBeNull();
    },
  );
});
