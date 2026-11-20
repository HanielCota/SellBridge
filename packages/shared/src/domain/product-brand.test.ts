import { describe, expect, it } from "vitest";
import { isNoBrand, normalizedBrandWords } from "./product-brand.ts";

describe("isNoBrand", () => {
  it.each([null, undefined, "", "   "])("treats a missing brand (%j) as no brand", (brand) => {
    const result = isNoBrand(brand);

    expect(result).toBe(true);
  });

  it.each(["Sem marca", "SEM MARCA", "  sem   marca ", "Genérica", "genérico", "S/ Marca", "N/A"])(
    "recognizes %j as no brand",
    (brand) => {
      const result = isNoBrand(brand);

      expect(result).toBe(true);
    },
  );

  it.each(["Tramontina", "Marca Própria", "Sem Igual Moda"])(
    "keeps %j as a real brand",
    (brand) => {
      const result = isNoBrand(brand);

      expect(result).toBe(false);
    },
  );
});

describe("normalizedBrandWords", () => {
  it("drops accents, case, extra spaces and a closing period", () => {
    const result = normalizedBrandWords("  Genérica   Nacional. ");

    expect(result).toBe("generica nacional");
  });
});
