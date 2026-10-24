import { describe, expect, it } from "vitest";
import { foldCityName, MAX_CITY_SUGGESTIONS, suggestCities } from "./city-suggestions";

const AMAZONAS = ["Tefé", "Parintins", "Manaus", "Manacapuru", "Itacoatiara", "Humaitá", "Coari"];

describe("foldCityName", () => {
  it("ignores accents and case", () => {
    expect(foldCityName("  São Gabriel da Cachoeira ")).toBe("sao gabriel da cachoeira");
  });
});

describe("suggestCities", () => {
  it("leads with the capital when nothing is typed", () => {
    const suggestions = suggestCities(AMAZONAS, "", "Manaus");

    expect(suggestions[0]).toBe("Manaus");
    expect(suggestions.slice(1)).toEqual([
      "Coari",
      "Humaitá",
      "Itacoatiara",
      "Manacapuru",
      "Parintins",
    ]);
  });

  it("finds cities typed without accents, start of the name first", () => {
    expect(suggestCities(AMAZONAS, "te", "Manaus")).toEqual(["Tefé"]);
    expect(suggestCities(AMAZONAS, "ita", null)).toEqual(["Itacoatiara", "Humaitá"]);
  });

  it("suggests nothing once the typed city is in the list", () => {
    expect(suggestCities(AMAZONAS, "manaus", "Manaus")).toEqual([]);
  });

  it("suggests nothing for a city the list does not know, which stays typed", () => {
    expect(suggestCities(AMAZONAS, "Vila Nova", "Manaus")).toEqual([]);
  });

  it("shows at most a short list", () => {
    const many = Array.from({ length: 30 }, (_, index) => `Cidade ${index}`);

    expect(suggestCities(many, "", null)).toHaveLength(MAX_CITY_SUGGESTIONS);
  });
});
