import { describe, expect, it } from "vitest";
import { parseMarkupPercent } from "./use-price-rule-draft";

describe("parseMarkupPercent", () => {
  it.each([
    ["5", 5],
    ["300", 300],
    [" 60 ", 60],
  ])("accepts %j", (typed, percent) => {
    expect(parseMarkupPercent(typed)).toEqual({ kind: "markup", percent });
  });

  it.each(["4", "301", "12.5", "12,5", "30abc", "", "-10", "1e2", "99999"])(
    "refuses %j instead of reading part of it",
    (typed) => {
      expect(parseMarkupPercent(typed)).toBeNull();
    },
  );
});
