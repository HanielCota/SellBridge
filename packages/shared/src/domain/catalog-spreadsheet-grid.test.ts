import { describe, expect, it } from "vitest";
import {
  buildCatalogImport,
  type DetectedSpreadsheet,
  detectSpreadsheet,
} from "./catalog-spreadsheet.ts";
import { parseProductCsv } from "./product-csv.ts";
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
      { modelCode: "TENIS-CASUAL-COURO", color: "PRETO", size: "38" },
      { modelCode: "TENIS-CASUAL-COURO", color: "PRETO", size: "39" },
    ]);
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
    expect(new Set(rows.map((row) => row.product.grid?.modelCode))).toEqual(
      new Set(["TENIS-CASUAL-COURO"]),
    );
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
