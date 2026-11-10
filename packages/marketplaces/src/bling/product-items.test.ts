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
