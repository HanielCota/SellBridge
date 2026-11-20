import { describe, expect, it } from "vitest";
import type { FichaAttribute } from "./category-ficha.ts";
import { brandToSend } from "./generic-brand.ts";

function brandField(overrides: Partial<FichaAttribute> = {}): FichaAttribute {
  return {
    id: "BRAND",
    name: "Marca",
    value_type: "string",
    tags: { required: true },
    values: [],
    allowed_units: [],
    ...overrides,
  };
}

describe("brandToSend", () => {
  it("keeps the supplier's brand, trimmed", () => {
    const result = brandToSend("  Tramontina ", [brandField()]);

    expect(result).toEqual({ id: "BRAND", value_name: "Tramontina" });
  });

  it("sends the generic brand the category lists, with its id", () => {
    const definitions = [brandField({ values: [{ id: "35977846", name: "Generic" }] })];

    const result = brandToSend("", definitions);

    expect(result).toEqual({ id: "BRAND", value_name: "Generic", value_id: "35977846" });
  });

  it("sends the generic brand the category hint quotes", () => {
    const definitions = [
      brandField({
        hint: "Informe a marca verdadeira do produto ou 'Genérica' se não tiver marca.",
      }),
    ];

    const result = brandToSend("sem marca", definitions);

    expect(result).toEqual({ id: "BRAND", value_name: "Genérica" });
  });

  it("falls back to Genérica when the category names no generic brand", () => {
    const result = brandToSend(undefined, [brandField({ hint: "Informe a marca." })]);

    expect(result).toEqual({ id: "BRAND", value_name: "Genérica" });
  });

  it("does not take a real brand quoted in the hint for the generic one", () => {
    const definitions = [brandField({ hint: "Por exemplo 'Samsung'." })];

    const result = brandToSend("", definitions);

    expect(result).toEqual({ id: "BRAND", value_name: "Genérica" });
  });

  it("adds no brand when the category has no BRAND field and none was typed", () => {
    const result = brandToSend(undefined, []);

    expect(result).toBeNull();
  });

  it("still translates a typed sem marca when the category has no BRAND field", () => {
    const result = brandToSend("Sem marca", []);

    expect(result).toEqual({ id: "BRAND", value_name: "Genérica" });
  });
});
