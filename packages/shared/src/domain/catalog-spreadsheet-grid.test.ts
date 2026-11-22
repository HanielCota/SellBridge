import { describe, expect, it } from "vitest";
import {
  buildCatalogImport,
  type DetectedSpreadsheet,
  detectSpreadsheet,
} from "./catalog-spreadsheet.ts";
import { parseProductCsv } from "./product-csv.ts";
import { modelCodeFromTitle } from "./product-grid.ts";
import { planGridImport } from "./product-grid-import.ts";

const supplierHeader = [
  "SKU",
  "Nome produto",
  "Descrição",
  "Preço de venda",
  "Estoque",
  "URL Imagem 1",
  "Cor",
  "Tamanho",
  "Categoria Pai",
];
const shopeeHeader = [
  "Nome do Produto",
  "Nome da Variação",
  "SKU da Variação",
  "Preço",
  "Descrição do Produto [Básico]",
];
const categories = [{ slug: "calcados", name: "Calçados" }];
/** The code made from "Tênis Casual Couro": the name, then a hash of it. */
const CODE_OF_THE_NAME = /^TENIS-CASUAL-COURO-[0-9A-Z]{6}$/;

function sheetOf(name: string, rows: string[][]): DetectedSpreadsheet {
  const detected = detectSpreadsheet({ name: "Sheet1", rows }, name);
  if (detected === null) {
    throw new Error(`sheet ${name} not detected`);
  }
  return detected;
}

function shoe(sku: string, color: string, size: string, photo: string): string[] {
  return [sku, "Tênis Casual Couro", "Couro legítimo", "59.9", "4", photo, color, size, "Calçados"];
}

function gridImport(rows: string[][], extraSheets: DetectedSpreadsheet[] = []) {
  const catalog = sheetOf("fornecedor.xlsx", [supplierHeader, ...rows]);
  return buildCatalogImport({ sheets: [catalog, ...extraSheets], categories, gridColumns: true });
}

function parsedRows(csv: string) {
  const parsed = parseProductCsv(csv, { gridColumns: true });
  expect(parsed.errors).toEqual([]);
  return parsed.rows;
}

describe("buildCatalogImport with grid columns", () => {
  it("writes one product in several sizes as one grid named after the product", () => {
    const result = gridImport([
      shoe("TEN-P-38", "PRETO", "38", "https://cdn.example/p.jpg"),
      shoe("TEN-P-39", "PRETO", "39", "https://cdn.example/p.jpg"),
    ]);

    const rows = parsedRows(result.csv);

    expect(rows.map((row) => row.product.title)).toEqual([
      "Tênis Casual Couro",
      "Tênis Casual Couro",
    ]);
    expect(rows.map((row) => row.product.grid)).toEqual([
      { modelCode: expect.stringMatching(CODE_OF_THE_NAME), color: "PRETO", size: "38" },
      { modelCode: expect.stringMatching(CODE_OF_THE_NAME), color: "PRETO", size: "39" },
    ]);
    expect(new Set(rows.map((row) => row.product.grid?.modelCode)).size).toBe(1);
  });

  it("keeps a product with a single colour and size as a product of its own", () => {
    const result = gridImport([shoe("TEN-P-38", "PRETO", "38", "")]);

    const [row] = parsedRows(result.csv);

    expect(row?.product.title).toBe("Tênis Casual Couro - PRETO 38");
    expect(row?.product.grid).toBeUndefined();
  });

  it("reads a single size as no size, so colours alone form the grid", () => {
    const result = gridImport([
      shoe("BOL-BEG", "BEGE", "UNICO", ""),
      shoe("BOL-PRE", "PRETO", "Único", ""),
    ]);

    const rows = parsedRows(result.csv);

    expect(rows.map((row) => row.product.grid?.size)).toEqual([null, null]);
    expect(rows.map((row) => row.product.grid?.color)).toEqual(["BEGE", "PRETO"]);
  });

  it("becomes a grid the import accepts when sizes of a colour bring different photos", () => {
    const result = gridImport([
      shoe("TEN-P-38", "PRETO", "38", "https://cdn.example/p1.jpg"),
      shoe("TEN-P-39", "PRETO", "39", "https://cdn.example/p2.jpg"),
      shoe("TEN-B-38", "BRANCO", "38", "https://cdn.example/b.jpg"),
    ]);

    const plan = planGridImport({
      rows: parsedRows(result.csv),
      existingSkus: new Map(),
      existingModels: new Map(),
    });

    expect(plan.errors).toEqual([]);
    expect(plan.grids).toHaveLength(1);
    expect(plan.grids[0]?.colors).toEqual([
      { name: "PRETO", imageUrls: ["https://cdn.example/p1.jpg", "https://cdn.example/p2.jpg"] },
      { name: "BRANCO", imageUrls: ["https://cdn.example/b.jpg"] },
    ]);
  });

  it("takes the Shopee title and description for every size when only one has a listing", () => {
    const listing = sheetOf("shopee.xlsx", [
      shopeeHeader,
      ["Tênis Casual Couro Masculino", "Preto,38", "TEN-P-38", "119.9", "Descrição da Shopee"],
    ]);
    const result = gridImport(
      [shoe("TEN-P-38", "PRETO", "38", ""), shoe("TEN-P-39", "PRETO", "39", "")],
      [listing],
    );

    const rows = parsedRows(result.csv);

    expect(rows.map((row) => [row.product.title, row.product.description])).toEqual([
      ["Tênis Casual Couro Masculino", "Descrição da Shopee"],
      ["Tênis Casual Couro Masculino", "Descrição da Shopee"],
    ]);
    const codes = new Set(rows.map((row) => row.product.grid?.modelCode));
    expect(codes.size).toBe(1);
    expect([...codes][0]).toMatch(CODE_OF_THE_NAME);
  });

  it("keeps naming each row after its spreadsheet line", () => {
    const result = gridImport([
      shoe("TEN-P-38", "PRETO", "38", ""),
      shoe("TEN-P-39", "PRETO", "39", ""),
    ]);

    expect(result.lines.map((line) => [line.csvLine, line.rowNumber, line.sku])).toEqual([
      [2, 2, "TEN-P-38"],
      [3, 3, "TEN-P-39"],
    ]);
  });

  it("writes no grid columns while grids are off", () => {
    const catalog = sheetOf("fornecedor.xlsx", [
      supplierHeader,
      shoe("TEN-P-38", "PRETO", "38", ""),
      shoe("TEN-P-39", "PRETO", "39", ""),
    ]);

    const result = buildCatalogImport({ sheets: [catalog], categories });

    expect(result.csv.split("\r\n")[0]).not.toContain("codigo_modelo");
    expect(parseProductCsv(result.csv).rows.map((row) => row.product.title)).toEqual([
      "Tênis Casual Couro - PRETO 38",
      "Tênis Casual Couro - PRETO 39",
    ]);
  });
});

function named(name: string, sku: string, color: string, size: string): string[] {
  return [sku, name, "", "59.9", "4", "", color, size, "Calçados"];
}

describe("buildCatalogImport grids, as the review asked", () => {
  it("keeps apart two long names that differ only at the end", () => {
    const base = "Tênis Esportivo Masculino Confortável Para Caminhada Corrida Academia";
    const result = gridImport([
      named(`${base} Azul`, "A-38", "Azul", "38"),
      named(`${base} Azul`, "A-39", "Azul", "39"),
      named(`${base} Verde`, "V-38", "Verde", "38"),
      named(`${base} Verde`, "V-39", "Verde", "39"),
    ]);

    const rows = parsedRows(result.csv);

    expect(new Set(rows.map((row) => row.product.grid?.modelCode)).size).toBe(2);
    expect(rows.map((row) => row.product.title)).toEqual([
      `${base} Azul`,
      `${base} Azul`,
      `${base} Verde`,
      `${base} Verde`,
    ]);
  });

  it("writes a product the supplier already sells separately exactly as before grids", () => {
    const catalog = sheetOf("fornecedor.xlsx", [
      supplierHeader,
      shoe("TEN-P-38", "PRETO", "38", "https://cdn.example/p38.jpg"),
      shoe("TEN-P-39", "PRETO", "39", "https://cdn.example/p39.jpg"),
    ]);

    const result = buildCatalogImport({
      sheets: [catalog],
      categories,
      gridColumns: true,
      singleSkus: new Set(["TEN-P-38"]),
    });

    const rows = parsedRows(result.csv);
    expect(rows.map((row) => [row.product.title, row.product.imageUrls, row.product.grid])).toEqual(
      [
        ["Tênis Casual Couro - PRETO 38", ["https://cdn.example/p38.jpg"], undefined],
        ["Tênis Casual Couro - PRETO 39", ["https://cdn.example/p39.jpg"], undefined],
      ],
    );
  });

  it("never gives a grid the code a form grid of the same title would get", () => {
    const result = gridImport([
      shoe("TEN-P-38", "PRETO", "38", ""),
      shoe("TEN-P-39", "PRETO", "39", ""),
    ]);

    const [row] = parsedRows(result.csv);

    expect(row?.product.grid?.modelCode).not.toBe(modelCodeFromTitle("Tênis Casual Couro"));
  });

  it("keeps a product separate when one row is Único among sized rows", () => {
    const result = gridImport([
      shoe("TEN-P-38", "PRETO", "38", ""),
      shoe("TEN-P-39", "PRETO", "39", ""),
      shoe("TEN-P-U", "PRETO", "Único", ""),
    ]);

    const rows = parsedRows(result.csv);

    expect(rows.every((row) => row.product.grid === undefined)).toBe(true);
  });

  it("joins the photos of one colour written with and without its accent", () => {
    const result = gridImport([
      shoe("TEN-C-38", "Café", "38", "https://cdn.example/c1.jpg"),
      shoe("TEN-C-39", "Cafe", "39", "https://cdn.example/c2.jpg"),
    ]);

    const plan = planGridImport({
      rows: parsedRows(result.csv),
      existingSkus: new Map(),
      existingModels: new Map(),
    });

    expect(plan.errors).toEqual([]);
    expect(plan.grids[0]?.colors).toEqual([
      { name: "Café", imageUrls: ["https://cdn.example/c1.jpg", "https://cdn.example/c2.jpg"] },
    ]);
  });

  it("names the grid after the supplier when the Shopee listing has no name", () => {
    const listing = sheetOf("shopee.xlsx", [
      shopeeHeader,
      ["", "Preto,38", "TEN-P-38", "119.9", "Descrição da Shopee"],
    ]);

    const result = gridImport(
      [shoe("TEN-P-38", "PRETO", "38", ""), shoe("TEN-P-39", "PRETO", "39", "")],
      [listing],
    );

    expect(parsedRows(result.csv).map((row) => row.product.title)).toEqual([
      "Tênis Casual Couro",
      "Tênis Casual Couro",
    ]);
  });
});
