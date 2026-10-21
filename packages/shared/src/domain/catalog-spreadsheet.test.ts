import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_CSV_ROWS } from "../schemas/admin-suppliers.ts";
import {
  buildCatalogImport,
  detectSpreadsheet,
  findSourceLine,
  type DetectedSpreadsheet,
} from "./catalog-spreadsheet.ts";
import { parseProductCsv } from "./product-csv.ts";

const supplierHeader = [
  "SKU",
  "Nome produto",
  "Descrição",
  "Preço de custo",
  "Preço de venda",
  "Estoque",
  "URL Imagem 2",
  "URL Imagem 1",
  "Cor",
  "Tamanho",
  "Categoria Pai",
  "Categoria Filho",
];
const shopeeHeader = [
  "ID do Produto",
  "Nome do Produto",
  "SKU de referência",
  "Nome da Variação",
  "SKU da Variação",
  "Preço",
  "Descrição do Produto [Básico]",
  "Imagem de capa [Mídia]",
  "Imagem do produto 1 [Mídia]",
];
const categories = [
  { slug: "calcados", name: "Calçados" },
  { slug: "acessorios", name: "Acessórios" },
];

function supplierSheet(rows: string[][]): DetectedSpreadsheet {
  const detected = detectSpreadsheet(
    { name: "Sheet1", rows: [supplierHeader, ...rows] },
    "fornecedor.xlsx",
  );
  if (detected == null) {
    throw new Error("supplier sheet not detected");
  }
  return detected;
}

function shopeeSheet(rows: string[][]): DetectedSpreadsheet {
  const detected = detectSpreadsheet(
    { name: "Unificada", rows: [[], ["Exportado em 16/10"], shopeeHeader, ...rows] },
    "shopee.xlsx",
  );
  if (detected == null) {
    throw new Error("shopee sheet not detected");
  }
  return detected;
}

const bag = [
  "BOL-BEG",
  "BOLSA BAGUETE",
  "Bolsa compacta",
  "0.0",
  "27.859999999999999",
  "98.0",
  "https://cdn.example/2.jpg",
  "https://cdn.example/1.jpg",
  "BEGE",
  "UNICO",
  "Acessórios",
  "",
];
const sandal = [
  "SAN-TR-1718",
  "SANDALIA BABY",
  "Descrição do fornecedor",
  "",
  "14.7",
  "50",
  "",
  "https://cdn.example/s.jpg",
  "TRANSPARENTE",
  "17/18",
  "",
  "Calçados",
];

describe("detectSpreadsheet", () => {
  it("deve reconhecer o catálogo do fornecedor e numerar as linhas como na planilha", () => {
    const sheet = supplierSheet([bag, ["", "", ""], sandal]);

    expect(sheet.kind).toBe("supplier-catalog");
    expect(sheet.source).toBe("fornecedor.xlsx › Sheet1");
    expect(sheet.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
  });

  it("deve encontrar o cabeçalho da Shopee abaixo de linhas de título", () => {
    const sheet = shopeeSheet([["1", "Sandália", "", "Rosa,17/18", "SAN-RO-1718", "29.9"]]);

    expect(sheet.kind).toBe("shopee-listings");
    expect(sheet.rows[0]?.rowNumber).toBe(4);
  });

  it("deve retornar null quando nenhuma linha tem um cabeçalho conhecido", () => {
    const detected = detectSpreadsheet(
      {
        name: "Plan1",
        rows: [
          ["a", "b"],
          ["1", "2"],
        ],
      },
      "x.xlsx",
    );

    expect(detected).toBeNull();
  });
});

describe("buildCatalogImport", () => {
  it("deve converter o catálogo do fornecedor no CSV de importação", () => {
    const result = buildCatalogImport({ sheets: [supplierSheet([bag])], categories });

    const parsed = parseProductCsv(result.csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product).toEqual({
      sku: "BOL-BEG",
      title: "BOLSA BAGUETE - BEGE",
      description: "Bolsa compacta",
      costCents: 2786,
      stock: 98,
      categorySlug: "acessorios",
      imageUrls: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
    });
    expect(result).toMatchObject({ productCount: 1, enrichedCount: 0, unmatchedListingSkus: [] });
  });

  it("deve preferir o preço de custo quando ele for maior que zero", () => {
    const withCost = bag.with(3, "20,5");

    const result = buildCatalogImport({ sheets: [supplierSheet([withCost])], categories });

    expect(parseProductCsv(result.csv).rows[0]?.product.costCents).toBe(2050);
  });

  it("deve completar com preço, título, descrição e imagens da Shopee pelo SKU", () => {
    const listing = [
      "58270000437",
      "Sandália Baby Mel",
      "",
      "Transparente,17/18",
      "SAN-TR-1718",
      "29.899999999999999",
      'Descrição "Shopee"\r\ncom quebra',
      "https://cf.shopee/capa",
      "https://cdn.example/s.jpg",
    ];
    const orphan = ["1", "Outro", "", "", "SEM-FORNECEDOR", "10"];
    const sheets = [shopeeSheet([listing, orphan]), supplierSheet([bag, sandal])];

    const result = buildCatalogImport({ sheets, categories });

    const parsed = parseProductCsv(result.csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[1]?.product).toEqual({
      sku: "SAN-TR-1718",
      title: "Sandália Baby Mel - Transparente 17/18",
      description: 'Descrição "Shopee"\ncom quebra',
      costCents: 1470,
      stock: 50,
      categorySlug: "calcados",
      imageUrls: ["https://cdn.example/s.jpg", "https://cf.shopee/capa"],
      suggestedPriceCents: 2990,
    });
    expect(result).toMatchObject({ enrichedCount: 1, unmatchedListingSkus: ["SEM-FORNECEDOR"] });
  });

  it("deve manter valores inválidos para a validação apontar a linha certa", () => {
    const invalid = bag.with(4, "abc").with(5, "2.5");
    const sheets = [supplierSheet([sandal, invalid])];

    const result = buildCatalogImport({ sheets, categories });

    const [error] = parseProductCsv(result.csv).errors;
    expect(error?.reason).toContain("Custo");
    expect(error?.reason).toContain("Estoque");
    expect(findSourceLine(result.lines, error?.line ?? 0)).toMatchObject({
      rowNumber: 3,
      sku: "BOL-BEG",
    });
  });

  it("deve mapear linhas do CSV de volta mesmo com descrições de várias linhas", () => {
    const multiline = bag.with(2, "a\nb\nc");
    const result = buildCatalogImport({ sheets: [supplierSheet([multiline, sandal])], categories });

    const sandalLine = parseProductCsv(result.csv).rows[1]?.line ?? 0;

    expect(sandalLine).toBe(5);
    expect(findSourceLine(result.lines, sandalLine)?.sku).toBe("SAN-TR-1718");
    expect(findSourceLine(result.lines, 1)).toBeNull();
  });

  it("deve exigir a planilha do fornecedor", () => {
    const sheets = [shopeeSheet([["1", "Sandália", "", "", "SKU", "10"]])];

    expect(() => buildCatalogImport({ sheets, categories })).toThrow(/planilha de produtos/);
  });

  it("deve recusar planilha do fornecedor sem produtos", () => {
    expect(() => buildCatalogImport({ sheets: [supplierSheet([])], categories })).toThrow(
      /não contém produtos/,
    );
  });

  it("deve recusar mais produtos do que a importação aceita", () => {
    const rows = Array.from({ length: MAX_PRODUCT_CSV_ROWS + 1 }, (_, index) =>
      bag.with(0, `SKU-${index}`),
    );

    expect(() => buildCatalogImport({ sheets: [supplierSheet(rows)], categories })).toThrow(
      /no máximo/,
    );
  });
});
