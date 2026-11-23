import { describe, expect, it } from "vitest";
import { hasEnoughLetters } from "./release-reason";

describe("hasEnoughLetters", () => {
  it("takes a reason with ten letters or more", () => {
    expect(hasEnoughLetters("Remessa recusada pela SEFAZ")).toBe(true);
  });

  it("refuses dots and spaces that only look long", () => {
    expect(hasEnoughLetters("..........")).toBe(false);
    expect(hasEnoughLetters("a . b . c . d . e")).toBe(false);
  });
});
