import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fichaAttributeSchema } from "./category-ficha.ts";
import { kindAttributesFromCategory, missingKindDefinitions } from "./category-kind.ts";
import { FOOTWEAR_ATTRIBUTES } from "./fixtures/category-footwear.ts";

const definitions = z.array(fichaAttributeSchema).parse(FOOTWEAR_ATTRIBUTES);

describe("missingKindDefinitions", () => {
  it("lists the footwear type when the supplier left it empty", () => {
    const missing = missingKindDefinitions(definitions, { BRAND: "Nuvem", FOOTWEAR_TYPE: "  " });

    expect(missing.map(({ id }) => id)).toEqual(["FOOTWEAR_TYPE"]);
  });

  it("keeps the footwear type the supplier filled", () => {
    const missing = missingKindDefinitions(definitions, { FOOTWEAR_TYPE: "Chinelo" });

    expect(missing).toEqual([]);
  });
});

describe("kindAttributesFromCategory", () => {
  it("answers the footwear type with the value named like the category", () => {
    const filled = kindAttributesFromCategory(definitions, "Tênis");

    expect(filled).toEqual([{ id: "FOOTWEAR_TYPE", value_id: "900001", value_name: "Tênis" }]);
  });

  it("matches a plural category name without accents or case", () => {
    const filled = kindAttributesFromCategory(definitions, "SANDALIAS");

    expect(filled).toEqual([{ id: "FOOTWEAR_TYPE", value_id: "900003", value_name: "Sandália" }]);
  });

  it("leaves the footwear type empty when no value is named like the category", () => {
    const filled = kindAttributesFromCategory(definitions, "Calçados Infantis");

    expect(filled).toEqual([]);
  });

  it("leaves the footwear type empty when several values are named like the category", () => {
    const [footwearType] = missingKindDefinitions(definitions, {});
    const doubled = footwearType === undefined ? [] : [footwearType];
    const withTwin = doubled.map((definition) => ({
      ...definition,
      values: [...definition.values, { id: "900099", name: "Tenis" }],
    }));

    const filled = kindAttributesFromCategory(withTwin, "Tênis");

    expect(filled).toEqual([]);
  });

  it("leaves the footwear type empty when the category has no name", () => {
    const filled = kindAttributesFromCategory(definitions, " ");

    expect(filled).toEqual([]);
  });
});
