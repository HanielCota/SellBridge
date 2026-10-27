import { describe, expect, it } from "vitest";
import { OTHER_NICHE, nicheChoice, nicheValue } from "./brand-niche";

const CATEGORIES = ["Moda feminina", "Calçados", "Pet shop"];

describe("nicheChoice", () => {
  it("picks the category that matches the saved niche, ignoring case and accents", () => {
    expect(nicheChoice("moda feminina", CATEGORIES)).toEqual({
      choice: "Moda feminina",
      custom: "",
    });
    expect(nicheChoice("Calcados", CATEGORIES)).toEqual({ choice: "Calçados", custom: "" });
  });

  it("keeps a free-text niche from before the list under Outra", () => {
    expect(nicheChoice("Semijoias artesanais", CATEGORIES)).toEqual({
      choice: OTHER_NICHE,
      custom: "Semijoias artesanais",
    });
  });

  it("starts with nothing picked when there is no niche yet", () => {
    expect(nicheChoice("  ", CATEGORIES)).toEqual({ choice: "", custom: "" });
  });
});

describe("nicheValue", () => {
  it("saves the category name or the typed text for Outra", () => {
    expect(nicheValue({ choice: "Pet shop", custom: "ignored" })).toBe("Pet shop");
    expect(nicheValue({ choice: OTHER_NICHE, custom: "Semijoias" })).toBe("Semijoias");
  });
});
