import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fichaAttributeSchema } from "./category-ficha.ts";
import {
  kindAttributesFromCategory,
  kindAttributesFromTitle,
  missingKindDefinitions,
} from "./category-kind.ts";
import { FOOTWEAR_ATTRIBUTES } from "./fixtures/category-footwear.ts";

const definitions = z.array(fichaAttributeSchema).parse(FOOTWEAR_ATTRIBUTES);
const footwearType = missingKindDefinitions(definitions, {});

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

describe("kindAttributesFromTitle", () => {
  it("answers the footwear type the title names", () => {
    const filled = kindAttributesFromTitle(footwearType, "CHINELO NUVEM Cor:PRETO;Tamanho:37/38");

    expect(filled).toEqual([{ id: "FOOTWEAR_TYPE", value_id: "517586", value_name: "Chinelo" }]);
  });

  it("matches a plural title word without accents", () => {
    const filled = kindAttributesFromTitle(footwearType, "Kit 2 sandalias de praia");

    expect(filled).toEqual([{ id: "FOOTWEAR_TYPE", value_id: "517585", value_name: "Sandália" }]);
  });

  it("leaves the footwear type empty when the title names none of the listed kinds", () => {
    const filled = kindAttributesFromTitle(footwearType, "BABUCHE NUVEM Cor:MARINHO;Tamanho:33/34");

    expect(filled).toEqual([]);
  });

  it("leaves the footwear type empty when the title names two kinds", () => {
    const filled = kindAttributesFromTitle(footwearType, "Chinelo tamanco de borracha");

    expect(filled).toEqual([]);
  });
});

describe("kindAttributesFromCategory", () => {
  it("answers the footwear type with the value named like the whole category", () => {
    const filled = kindAttributesFromCategory(footwearType, "Tamancos");

    expect(filled).toEqual([{ id: "FOOTWEAR_TYPE", value_id: "3630523", value_name: "Tamanco" }]);
  });

  it("leaves the footwear type empty when the category names two kinds", () => {
    const filled = kindAttributesFromCategory(footwearType, "Sandálias e Chinelos");

    expect(filled).toEqual([]);
  });

  it("leaves the footwear type empty when the category has no name", () => {
    const filled = kindAttributesFromCategory(footwearType, " ");

    expect(filled).toEqual([]);
  });
});
