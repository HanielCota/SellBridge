import type { FichaField } from "@sellbridge/marketplaces";
import { describe, expect, it } from "vitest";
import { measureNumber, measureWithUnit, withMercadoLivreRequired } from "./mercado-livre-ficha";

function field(id: string, label: string, required: boolean): FichaField {
  return {
    id,
    label,
    kind: "text",
    options: [],
    units: [],
    defaultUnit: null,
    required,
    maxLength: null,
    hint: null,
    example: null,
  };
}

describe("withMercadoLivreRequired", () => {
  it("adds the attributes Mercado Livre requires that the category did not name", () => {
    const own = [{ id: "GENDER", label: "Gênero" }];

    const required = withMercadoLivreRequired(own, [
      field("BRAND", "Marca", true),
      field("GENDER", "Gênero", true),
      field("IS_VEGAN", "É vegano", false),
    ]);

    expect(required).toEqual([
      { id: "GENDER", label: "Gênero" },
      { id: "BRAND", label: "Marca" },
    ]);
  });

  it("keeps our own list while the sheet is not known", () => {
    const own = [{ id: "SIZE", label: "Tamanho" }];

    expect(withMercadoLivreRequired(own, null)).toBe(own);
  });
});

describe("measures", () => {
  it("shows the number of a stored measure and stores what is typed with the unit", () => {
    expect(measureNumber("12 cm", "cm")).toBe("12");
    expect(measureWithUnit(" 12 ", "cm")).toBe("12 cm");
  });

  it("keeps a blank field blank and a value in another unit as it is", () => {
    expect(measureWithUnit("  ", "cm")).toBe("");
    expect(measureNumber("120 mm", "cm")).toBe("120 mm");
  });
});
