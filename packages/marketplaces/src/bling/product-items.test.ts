import { describe, expect, it } from "vitest";
import { blingProductToItems } from "./product-items.ts";
import type { BlingProductDetail } from "./schemas.ts";

const parent: BlingProductDetail = {
  id: 1,
  nome: "BABUCHE NUVEM",
  codigo: "1737774394178176842",
  preco: 65.9,
  situacao: "A",
  formato: "V",
  unidade: "UN",
  pesoBruto: 0.5,
  pesoLiquido: 0,
  marca: "Nuvem",
  tributacao: { origem: 0, ncm: "6402.99.90", cest: "" },
  midia: { imagens: { externas: [{ link: "https://cdn.exemplo.com/pai.jpg" }] } },
  variacoes: [
    {
      id: 2,
      nome: "BABUCHE NUVEM Cor:MARINHO;Tamanho:33/34",
      codigo: "001-BAB-EVA-FEM-MAR-3334",
      preco: 65.9,
      situacao: "A",
      estoque: { saldoVirtualTotal: 100 },
    },
    {
      id: 3,
      nome: "BABUCHE NUVEM Cor:PRETA;Tamanho:35/36",
      codigo: "",
      preco: 65.9,
      situacao: "A",
    },
    {
      id: 4,
      nome: "BABUCHE NUVEM Cor:ROXO;Tamanho:39/40",
      codigo: "001-BAB-EVA-FEM-ROX-3940",
      situacao: "I",
    },
  ],
};

describe("blingProductToItems", () => {
  it("turns each active variation into its own item with its Bling code as SKU", () => {
    const mapping = blingProductToItems(parent);

    expect(mapping.items.map((item) => item.sku)).toEqual(["001-BAB-EVA-FEM-MAR-3334"]);
  });

  it("fills a variation's empty fields from the parent and converts kg to grams", () => {
    const [item] = blingProductToItems(parent).items;

    expect(item).toMatchObject({
      title: "BABUCHE NUVEM Cor:MARINHO;Tamanho:33/34",
      priceCents: 6590,
      stock: 100,
      weightGrams: 500,
      brand: "Nuvem",
      imageUrls: ["https://cdn.exemplo.com/pai.jpg"],
      fiscal: { ncm: "64029990", origin: 0, unit: "UN", cest: null },
    });
  });

  it("reports a variation without a code instead of importing it", () => {
    const mapping = blingProductToItems(parent);

    expect(mapping.skipped).toEqual([
      { name: "BABUCHE NUVEM Cor:PRETA;Tamanho:35/36", reason: "Sem código (SKU) no Bling" },
    ]);
  });

  it("keeps a missing NCM and unit as null for the fiscal fields to flag", () => {
    const simple: BlingProductDetail = {
      id: 9,
      nome: "Tênis Pulse",
      codigo: "199904479484",
      preco: 79.9,
      situacao: "A",
      formato: "S",
      unidade: "",
      pesoBruto: 0,
      tributacao: { ncm: "" },
    };

    const [item] = blingProductToItems(simple).items;

    expect(item).toMatchObject({
      sku: "199904479484",
      weightGrams: null,
      fiscal: { ncm: null, unit: null, origin: null },
    });
  });
});

function shoe(variations: BlingProductDetail["variacoes"]): BlingProductDetail {
  return { ...parent, id: 10, nome: "Tênis Casual", codigo: "TEN-CASUAL", variacoes: variations };
}

function variation(id: number, sku: string, options: string) {
  return { id, nome: `Tênis Casual ${options}`, codigo: sku, situacao: "A" as const };
}

describe("blingProductToItems with colours and sizes", () => {
  it("puts variations named by colour and size in their parent's grid, with their Bling ids", () => {
    const product = shoe([
      { ...variation(11, "TEN-P-38", "x"), variacao: { nome: "Cor:Preto;Tamanho:38" } },
      { ...variation(12, "TEN-P-39", "x"), variacao: { nome: "Cor:Preto;Tamanho:39" } },
    ]);

    const mapping = blingProductToItems(product);

    expect(mapping.items.map((item) => [item.sku, item.erpProductId, item.grid])).toEqual([
      [
        "TEN-P-38",
        11,
        { modelCode: "TEN-CASUAL", modelTitle: "Tênis Casual", color: "Preto", size: "38" },
      ],
      [
        "TEN-P-39",
        12,
        { modelCode: "TEN-CASUAL", modelTitle: "Tênis Casual", color: "Preto", size: "39" },
      ],
    ]);
    expect(mapping.separated).toEqual([]);
  });

  it("reads the options from the variation's full name when Bling leaves its variation name out", () => {
    const product = shoe([variation(11, "TEN-P-38", "Cor:Preto;Tamanho:38")]);

    const [item] = blingProductToItems(product).items;

    expect(item?.grid).toMatchObject({ color: "Preto", size: "38" });
  });

  it("keeps variations of anything else separate, as before grids, and says so", () => {
    const product = shoe([
      { ...variation(11, "LIQ-110", "x"), variacao: { nome: "Voltagem:110V" } },
      { ...variation(12, "LIQ-220", "x"), variacao: { nome: "Voltagem:220V" } },
    ]);

    const mapping = blingProductToItems(product);

    expect(mapping.items.map((item) => [item.sku, item.grid ?? null])).toEqual([
      ["LIQ-110", null],
      ["LIQ-220", null],
    ]);
    expect(mapping.separated).toEqual([
      { name: "Tênis Casual", reason: expect.stringContaining("não formam uma grade") },
    ]);
  });

  it("gives a simple product its Bling id and no grid", () => {
    const simple: BlingProductDetail = {
      ...parent,
      id: 20,
      formato: "S",
      codigo: "BOLSA",
      variacoes: [],
    };

    const [item] = blingProductToItems(simple).items;

    expect(item).toMatchObject({ sku: "BOLSA", erpProductId: 20 });
    expect(item?.grid).toBeUndefined();
  });
});

function named(id: number, sku: string, options: string) {
  return { ...variation(id, sku, "x"), variacao: { nome: options } };
}

describe("blingProductToItems variations that fail as a grid", () => {
  it.each([
    ["mixes variations with and without a size", ["Cor:Preto", "Cor:Preto;Tamanho:38"]],
    ["repeats a colour and size", ["Cor:Preto;Tamanho:38", "Cor:preto;Tamanho:38"]],
  ])("keeps separate a product whose variations %s", (_case, names) => {
    const product = shoe(names.map((name, index) => named(20 + index, `SKU-${index}`, name)));

    const mapping = blingProductToItems(product);

    expect(mapping.items.every((item) => (item.grid ?? null) === null)).toBe(true);
    expect(mapping.separated).toHaveLength(1);
  });

  it("keeps separate a product with more variations than a grid takes", () => {
    const product = shoe(
      Array.from({ length: 51 }, (_, index) =>
        named(100 + index, `G-${index}`, `Tamanho:${index}`),
      ),
    );

    expect(blingProductToItems(product).separated).toHaveLength(1);
  });

  it("keeps separate a variation whose full name does not start with its parent's", () => {
    const product = shoe(
      [variation(11, "TEN-P-38", "Cor:Preto;Tamanho:38")].map((entry) => ({
        ...entry,
        nome: "Outro nome Cor:Preto;Tamanho:38",
      })),
    );

    const mapping = blingProductToItems(product);

    expect(mapping.items[0]?.grid ?? null).toBeNull();
    expect(mapping.separated).toHaveLength(1);
  });

  it("leaves inactive variations out and still makes the grid of the active ones", () => {
    const product = shoe([
      named(11, "TEN-P-38", "Cor:Preto;Tamanho:38"),
      { ...named(12, "TEN-P-39", "Voltagem:110V"), situacao: "I" as const },
      named(13, "TEN-P-40", "Cor:Preto;Tamanho:40"),
    ]);

    const mapping = blingProductToItems(product);

    expect(mapping.items.map((item) => [item.sku, item.grid?.size])).toEqual([
      ["TEN-P-38", "38"],
      ["TEN-P-40", "40"],
    ]);
    expect(mapping.separated).toEqual([]);
  });

  it("keeps separate the variations of a parent without a name", () => {
    const product = { ...shoe([named(11, "TEN-P-38", "Cor:Preto;Tamanho:38")]), nome: "  " };

    const mapping = blingProductToItems(product);

    expect(mapping.items[0]?.grid ?? null).toBeNull();
    expect(mapping.separated).toHaveLength(1);
  });
});
