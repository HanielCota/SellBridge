import type { ErpCatalogReadResult } from "@sellbridge/shared/erp-catalog";
import { describe, expect, it } from "vitest";
import { countBlingProducts } from "./bling-overview";
import { blingReadRows } from "./bling-read-rows";

function variation(sku: string, size: string): ErpCatalogReadResult["items"][number] {
  return {
    sku,
    title: `Tênis Cor:Preto;Tamanho:${size}`,
    description: "",
    priceCents: 11_990,
    stock: 3,
    imageUrls: [],
    brand: null,
    gtin: null,
    weightGrams: null,
    fiscal: { ncm: null, origin: null, unit: null, cest: null },
    erpProductId: 1,
    grid: { modelCode: "TEN", modelTitle: "Tênis", color: "Preto", size },
  };
}

const read: ErpCatalogReadResult = {
  items: [variation("TEN-P-38", "38"), variation("TEN-P-39", "39")],
  skipped: [],
  separated: [{ name: "Chapinha", reason: "As variações não formam uma grade" }],
  truncated: false,
};

describe("blingReadRows", () => {
  it("shows the read as before grids while they are off", () => {
    const rows = blingReadRows(read, new Map(), { gridColumns: false, singleSkus: new Set() });

    expect(rows.separated).toBe(0);
    expect(rows.rows.map((row) => row.modelCode)).toEqual([null, null]);
  });

  it("counts a grid as one product while grids are on", () => {
    const rows = blingReadRows(read, new Map(), { gridColumns: true, singleSkus: new Set() });

    expect(rows.separated).toBe(1);
    expect(countBlingProducts(rows.rows).products).toBe(1);
  });

  it("counts by SKU a grid with a SKU already sold separately, as the import writes it", () => {
    const rows = blingReadRows(read, new Map([["TEN-P-38", 5000]]), {
      gridColumns: true,
      singleSkus: new Set(["TEN-P-38"]),
    });

    expect(rows.rows.map((row) => row.modelCode)).toEqual([null, null]);
    expect(countBlingProducts(rows.rows)).toMatchObject({ products: 2, existing: 1, fresh: 1 });
  });
});
