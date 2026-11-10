import { describe, expect, it } from "vitest";
import { buildErpCatalogCsv, type ErpCatalogItem } from "./erp-catalog.ts";
import { parseProductCsv } from "./product-csv.ts";

const ITEM: ErpCatalogItem = {
  sku: "054-TRA-ECO-BRA",
  title: 'Travesseiro "Eco-Pluma" 70x50',
  description: "Fibra siliconada",
  priceCents: 3990,
  stock: 100,
  imageUrls: ["https://cdn.exemplo.com/a.jpg", "https://cdn.exemplo.com/b.jpg"],
  brand: "JM Home",
  gtin: "7891234567895",
  weightGrams: 600,
  fiscal: { ncm: "94049000", origin: 0, unit: "UN", cest: null },
};

describe("buildErpCatalogCsv", () => {
  it("writes a file the product import reads back", () => {
    const csv = buildErpCatalogCsv([ITEM]);

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product).toMatchObject({
      sku: "054-TRA-ECO-BRA",
      title: 'Travesseiro "Eco-Pluma" 70x50',
      costCents: 3990,
      stock: 100,
      imageUrls: ["https://cdn.exemplo.com/a.jpg", "https://cdn.exemplo.com/b.jpg"],
    });
  });

  it("shows a negative ERP balance as no stock", () => {
    const csv = buildErpCatalogCsv([{ ...ITEM, stock: -4 }]);

    const parsed = parseProductCsv(csv);

    expect(parsed.rows[0]?.product.stock).toBe(0);
  });

  it("leaves out a GTIN that is not a barcode, such as SEM GTIN", () => {
    const csv = buildErpCatalogCsv([{ ...ITEM, gtin: "SEM GTIN" }]);

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.mercadoLivreAttributes?.GTIN).toBeUndefined();
  });

  it("leaves the cost blank when the ERP has no price, so the preview names the row", () => {
    const csv = buildErpCatalogCsv([{ ...ITEM, priceCents: null }]);

    const parsed = parseProductCsv(csv);

    expect(parsed.errors.length).toBeGreaterThan(0);
  });
});
