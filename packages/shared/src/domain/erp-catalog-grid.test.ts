import { describe, expect, it } from "vitest";
import {
  buildErpCatalogCsv,
  erpCatalogReadResultSchema,
  planErpCatalogImport,
  type ErpCatalogItem,
} from "./erp-catalog.ts";
import { parseProductCsv } from "./product-csv.ts";
import { planGridImport } from "./product-grid-import.ts";
import { normalizeImportFile } from "./supplier-panel-import.ts";

function variation(
  sku: string,
  color: string,
  size: string,
  overrides: Partial<ErpCatalogItem> = {},
): ErpCatalogItem {
  return {
    sku,
    title: `Tênis Casual Cor:${color};Tamanho:${size}`,
    description: "",
    priceCents: 11_990,
    stock: 3,
    imageUrls: [],
    brand: null,
    gtin: null,
    weightGrams: null,
    fiscal: { ncm: null, origin: null, unit: null, cest: null },
    erpProductId: 100,
    grid: { modelCode: "TEN-CASUAL", modelTitle: "Tênis Casual", color, size },
    ...overrides,
  };
}

const COSTS = new Map([
  ["TEN-P-38", 5990],
  ["TEN-P-39", 5990],
  ["TEN-B-38", 5990],
]);

function gridRows(items: readonly ErpCatalogItem[]) {
  const csv = buildErpCatalogCsv(items, COSTS, new Map(), { gridColumns: true });
  const normalized = normalizeImportFile(new TextEncoder().encode(csv), { gridColumns: true });
  const parsed = parseProductCsv(normalized.canonicalCsv, { gridColumns: true });
  expect(parsed.errors).toEqual([]);
  return parsed.rows;
}

describe("buildErpCatalogCsv with grid columns", () => {
  it("writes a variation under its model's name, code, colour and size", () => {
    const rows = gridRows([variation("TEN-P-38", "Preto", "38")]);

    expect(rows[0]?.product).toMatchObject({
      sku: "TEN-P-38",
      title: "Tênis Casual",
      grid: { modelCode: "TEN-CASUAL", color: "Preto", size: "38" },
    });
  });

  it("becomes a grid the import accepts when Bling fills the shared data on some variations only", () => {
    const items = [
      variation("TEN-P-38", "Preto", "38", {
        imageUrls: ["https://cdn.exemplo.com/p1.jpg"],
        fiscal: { ncm: "64039990", origin: 0, unit: "PAR", cest: null },
      }),
      variation("TEN-P-39", "Preto", "39", {
        description: "Couro legítimo",
        brand: "Passo Firme",
        imageUrls: ["https://cdn.exemplo.com/p2.jpg"],
      }),
      variation("TEN-B-38", "Branco", "38", { weightGrams: 900 }),
    ];

    const plan = planGridImport({
      rows: gridRows(items),
      existingSkus: new Map(),
      existingModels: new Map(),
    });

    expect(plan.errors).toEqual([]);
    expect(plan.grids).toHaveLength(1);
    expect(plan.grids[0]?.first).toMatchObject({
      description: "Couro legítimo",
      fiscal: { ncm: "64039990", unit: "PAR" },
    });
    expect(plan.grids[0]?.colors).toEqual([
      {
        name: "Preto",
        imageUrls: ["https://cdn.exemplo.com/p1.jpg", "https://cdn.exemplo.com/p2.jpg"],
      },
      { name: "Branco", imageUrls: [] },
    ]);
  });

  it("writes the ERP's own names and no grid columns while grids are off", () => {
    const csv = buildErpCatalogCsv([variation("TEN-P-38", "Preto", "38")], COSTS);

    const rows = parseProductCsv(
      normalizeImportFile(new TextEncoder().encode(csv)).canonicalCsv,
    ).rows;

    expect(csv.split("\r\n")[0]).not.toContain("codigo_modelo");
    expect(rows[0]?.product.title).toBe("Tênis Casual Cor:Preto;Tamanho:38");
  });
});

describe("planErpCatalogImport with grids", () => {
  it("names a variation by its model and its colour and size", () => {
    const [row] = planErpCatalogImport([variation("TEN-P-38", "Preto", "38")], new Map(), {
      gridColumns: true,
    });

    expect(row?.title).toBe("Tênis Casual · Preto 38");
    expect(row?.modelCode).toBe("TEN-CASUAL");
  });

  it("keeps the ERP's own name while grids are off", () => {
    const [row] = planErpCatalogImport([variation("TEN-P-38", "Preto", "38")], new Map());

    expect(row?.title).toBe("Tênis Casual Cor:Preto;Tamanho:38");
  });
});

describe("erpCatalogReadResultSchema with grids", () => {
  it("still opens a read stored before grids, with no product kept separate", () => {
    const { erpProductId: _id, grid: _grid, ...stored } = variation("TEN-P-38", "Preto", "38");

    const parsed = erpCatalogReadResultSchema.parse({
      items: [stored],
      skipped: [],
      truncated: false,
    });

    expect(parsed.separated).toEqual([]);
    expect(parsed.items[0]?.grid).toBeUndefined();
  });
});
