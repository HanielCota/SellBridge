import { describe, expect, it } from "vitest";
import { moneyFigureParts } from "./figures";

describe("moneyFigureParts", () => {
  it.each([
    [-40, false, "", 0],
    [-49, false, "", 0],
    [-50, false, "−", 1],
    [-150_049, false, "−", 1500],
    [0, false, "", 0],
    [149, false, "", 1],
  ])("shows %i cents in whole reais with sign %j", (cents, withCents, sign, whole) => {
    expect(moneyFigureParts(cents, withCents)).toMatchObject({ sign, whole });
  });

  it("keeps the sign of a few cents when the cents are shown", () => {
    expect(moneyFigureParts(-40, true)).toMatchObject({ sign: "−", whole: 0, absolute: 40 });
    expect(moneyFigureParts(0, true)).toMatchObject({ sign: "" });
  });
});
