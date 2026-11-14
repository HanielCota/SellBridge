import { describe, expect, it } from "vitest";
import { occurrencesLabel, problemWhenLabel } from "./problem-copy";

describe("problemWhenLabel", () => {
  it("says how long ago and the exact moment in Brazil time", () => {
    const now = new Date("2026-11-13T17:07:00Z");

    const label = problemWhenLabel(new Date("2026-11-13T17:02:00Z"), now);

    expect(label).toBe("há 5 minutos · 13/11 14:02");
  });
});

describe("occurrencesLabel", () => {
  it.each([
    [1, "1 vez"],
    [12, "12 vezes"],
    [1500, "1.500 vezes"],
  ])("writes %i as %s", (count, label) => {
    expect(occurrencesLabel(count)).toBe(label);
  });
});
