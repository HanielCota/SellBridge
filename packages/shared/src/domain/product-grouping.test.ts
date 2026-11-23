import { describe, expect, it } from "vitest";
import {
  canGroup,
  groupingProblems,
  groupingSummary,
  readGroupedTitle,
  suggestGroupings,
  type GroupingCandidate,
  type GroupingProduct,
} from "./product-grouping.ts";

describe("readGroupedTitle", () => {
  it("reads colour and size after the EnvioVelox dash", () => {
    expect(readGroupedTitle("Tênis Casual - Azul Marinho 38")).toEqual({
      baseName: "Tênis Casual",
      color: "Azul Marinho",
      size: "38",
    });
  });

  it("reads a lone colour or a lone size after the dash", () => {
    expect(readGroupedTitle("Camiseta - Preta")).toEqual({
      baseName: "Camiseta",
      color: "Preta",
      size: null,
    });
    expect(readGroupedTitle("Camiseta - GG")).toEqual({
      baseName: "Camiseta",
      color: null,
      size: "GG",
    });
  });

  it("splits on the last dash, so the model's own dashes stay in its name", () => {
    expect(readGroupedTitle("Kit - Verão - Branco 33/34")).toEqual({
      baseName: "Kit - Verão",
      color: "Branco",
      size: "33/34",
    });
  });

  it("reads Bling's variation names, Numeração included", () => {
    expect(readGroupedTitle("BABUCHE NUVEM Cor:MARINHO;Numeração:33/34")).toEqual({
      baseName: "BABUCHE NUVEM",
      color: "MARINHO",
      size: "33/34",
    });
  });

  it("leaves colour and size empty when Bling names another option", () => {
    expect(readGroupedTitle("Secador Cor:Preto;Voltagem:220V")).toEqual({
      baseName: "Secador",
      color: null,
      size: null,
    });
  });

  it("leaves colour and size empty when the end is too long to be an option", () => {
    expect(readGroupedTitle(`Bolsa - ${"Couro legítimo trabalhado à mão ".repeat(2)}`)).toEqual({
      baseName: "Bolsa",
      color: null,
      size: null,
    });
  });

  it("returns null for a name without colour or size", () => {
    expect(readGroupedTitle("Tênis Casual Couro")).toBeNull();
    expect(readGroupedTitle(" - Preto")).toBeNull();
  });
});

function candidate(
  id: string,
  title: string,
  overrides: Partial<GroupingCandidate> = {},
): GroupingCandidate {
  return { id, sku: `TEN-${id}`, title, categoryId: "shoes", completeness: 1, ...overrides };
}

describe("suggestGroupings", () => {
  it("groups by name, category and SKU start, in colour then size order", () => {
    const suggestions = suggestGroupings([
      candidate("a", "Tênis Casual - Preto 39"),
      candidate("b", "Tênis Casual - Branco 38"),
      candidate("c", "Tênis Casual - Preto 38"),
      candidate("d", "tenis casual - Branco 39", { completeness: 5 }),
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.modelTitle).toBe("Tênis Casual");
    expect(suggestions[0]?.mainProductId).toBe("d");
    expect(suggestions[0]?.products.map((entry) => entry.product.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("keeps products of another category or SKU start apart", () => {
    const suggestions = suggestGroupings([
      candidate("a", "Tênis - Preto 38"),
      candidate("b", "Tênis - Preto 39", { categoryId: "bags" }),
      candidate("c", "Tênis - Preto 40", { sku: "XYZ-40" }),
    ]);

    expect(suggestions).toEqual([]);
  });

  it("leaves out groups of one product and groups bigger than a grid", () => {
    const big = Array.from({ length: 51 }, (_, index) =>
      candidate(`big${index}`, `Meia - Cor${index} 38`),
    );

    const suggestions = suggestGroupings([candidate("alone", "Bota - Preta 38"), ...big]);

    expect(suggestions).toEqual([]);
  });

  it("lists bigger groups first", () => {
    const suggestions = suggestGroupings([
      candidate("a", "Bota - Preta 38"),
      candidate("b", "Bota - Preta 39"),
      candidate("c", "Sandália - Nude 35"),
      candidate("d", "Sandália - Nude 36"),
      candidate("e", "Sandália - Nude 37"),
    ]);

    expect(suggestions.map((suggestion) => suggestion.modelTitle)).toEqual(["Sandália", "Bota"]);
  });
});

function product(id: string, overrides: Partial<GroupingProduct> = {}): GroupingProduct {
  return {
    productId: id,
    sku: `SKU-${id}`,
    color: "Preto",
    size: id,
    categoryId: "shoes",
    fiscal: { ncm: "64039990", origin: 0, unit: "PAR" },
    ...overrides,
  };
}

describe("groupingProblems", () => {
  it("accepts products with the same NCM, origin and unit and distinct pairs", () => {
    const problems = groupingProblems({
      modelTitle: "Tênis",
      mainProductId: "38",
      products: [product("38"), product("39")],
    });

    expect(canGroup(problems)).toBe(true);
  });

  it("names the product whose NCM differs from the main product's", () => {
    const problems = groupingProblems({
      modelTitle: "Tênis",
      mainProductId: "38",
      products: [product("38"), product("39", { fiscal: { ncm: null, origin: 0, unit: "PAR" } })],
    });

    expect(problems.byProduct["39"]).toEqual([
      "NCM diferente do produto principal (vazio aqui, 6403.99.90 no principal). Corrija este produto antes de juntar.",
    ]);
    expect(problems.byProduct["38"]).toBeUndefined();
  });

  it("refuses a repeated colour and size next to the second product", () => {
    const problems = groupingProblems({
      modelTitle: "Tênis",
      mainProductId: "a",
      products: [product("a", { size: "38" }), product("b", { color: "preto", size: "38" })],
    });

    expect(problems.byProduct.b).toEqual([
      "preto 38 já é o código SKU-a: corrija a cor ou o tamanho",
    ]);
  });

  it("asks for the colour when the other products have one", () => {
    const problems = groupingProblems({
      modelTitle: "Tênis",
      mainProductId: "a",
      products: [product("a"), product("b", { color: null })],
    });

    expect(problems.byProduct.b).toEqual(["Informe a cor, como nos outros produtos"]);
  });

  it("refuses a group of one, a missing name and a main product left unchecked", () => {
    const problems = groupingProblems({
      modelTitle: " ",
      mainProductId: "other",
      products: [product("a")],
    });

    expect(problems.general).toEqual([
      "Informe o nome do modelo",
      "Marque pelo menos 2 produtos",
      "Escolha o produto principal entre os marcados",
    ]);
  });
});

describe("groupingSummary", () => {
  it("counts products, colours and sizes", () => {
    expect(
      groupingSummary([
        { color: "Preto", size: "38" },
        { color: "preto", size: "39" },
        { color: "Branco", size: "38" },
      ]),
    ).toBe("3 produtos → 1 produto com 2 cores e 2 tamanhos");
  });
});
