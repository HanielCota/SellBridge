import { describe, expect, it } from "vitest";
import {
  buildErpCatalogCsv,
  erpResellerCostsSchema,
  mergeResellerCosts,
  planErpCatalogImport,
  type ErpCatalogItem,
} from "./erp-catalog.ts";
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

const NEW_ITEM: ErpCatalogItem = { ...ITEM, sku: "054-TRA-ECO-BRA-K2", priceCents: 6990 };

describe("buildErpCatalogCsv", () => {
  it("writes the reseller cost from SellBridge and the ERP price as the suggested price", () => {
    const csv = buildErpCatalogCsv([ITEM], new Map([[ITEM.sku, 2500]]));

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product).toMatchObject({
      sku: "054-TRA-ECO-BRA",
      title: 'Travesseiro "Eco-Pluma" 70x50',
      costCents: 2500,
      suggestedPriceCents: 3990,
      stock: 100,
      imageUrls: ["https://cdn.exemplo.com/a.jpg", "https://cdn.exemplo.com/b.jpg"],
    });
  });

  it("leaves the cost blank without a reseller price, so the import refuses the row", () => {
    const csv = buildErpCatalogCsv([ITEM], new Map());

    const parsed = parseProductCsv(csv);

    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.rows).toEqual([]);
  });

  it("keeps a product the supplier took off sale off sale", () => {
    const csv = buildErpCatalogCsv([ITEM], new Map([[ITEM.sku, 2500]]));

    const parsed = parseProductCsv(csv);

    expect(parsed.rows[0]?.product.active).toBeUndefined();
  });

  it("keeps an existing product's category, photos and description when the ERP leaves them blank", () => {
    const blankItem: ErpCatalogItem = { ...ITEM, description: "", imageUrls: [] };
    const kept = new Map([
      [
        ITEM.sku,
        {
          categorySlug: "casa-e-decoracao",
          imageUrls: ["https://cdn.exemplo.com/antiga.jpg"],
          description: "Descrição do SellBridge",
        },
      ],
    ]);

    const csv = buildErpCatalogCsv([blankItem], new Map([[ITEM.sku, 2500]]), kept);

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product).toMatchObject({
      categorySlug: "casa-e-decoracao",
      imageUrls: ["https://cdn.exemplo.com/antiga.jpg"],
      description: "Descrição do SellBridge",
    });
  });

  it("uses the ERP's own photos and description over the kept ones when it has them", () => {
    const kept = new Map([
      [
        ITEM.sku,
        {
          categorySlug: "casa-e-decoracao",
          imageUrls: ["https://cdn.exemplo.com/antiga.jpg"],
          description: "Descrição do SellBridge",
        },
      ],
    ]);

    const csv = buildErpCatalogCsv([ITEM], new Map([[ITEM.sku, 2500]]), kept);

    const parsed = parseProductCsv(csv);

    expect(parsed.rows[0]?.product).toMatchObject({
      categorySlug: "casa-e-decoracao",
      imageUrls: ITEM.imageUrls,
      description: ITEM.description,
    });
  });

  it("shows a negative ERP balance as no stock", () => {
    const csv = buildErpCatalogCsv([{ ...ITEM, stock: -4 }], new Map([[ITEM.sku, 2500]]));

    const parsed = parseProductCsv(csv);

    expect(parsed.rows[0]?.product.stock).toBe(0);
  });

  it("keeps SEM GTIN, which the NF-e accepts for a product without a barcode", () => {
    const csv = buildErpCatalogCsv([{ ...ITEM, gtin: "SEM GTIN" }], new Map([[ITEM.sku, 2500]]));

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.mercadoLivreAttributes?.GTIN).toBe("SEM GTIN");
  });

  it("leaves out a GTIN that is not a barcode", () => {
    const csv = buildErpCatalogCsv([{ ...ITEM, gtin: "12345" }], new Map([[ITEM.sku, 2500]]));

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.mercadoLivreAttributes?.GTIN).toBeUndefined();
  });

  it("brings the ERP's NCM, origin, unit and CEST into the import", () => {
    const fiscal = { ncm: "64029990", origin: 0, unit: "Par", cest: "2806300" };
    const csv = buildErpCatalogCsv([{ ...ITEM, fiscal }], new Map([[ITEM.sku, 2500]]));

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.fiscal).toEqual({
      ncm: "64029990",
      origin: 0,
      unit: "PAR",
      cest: "2806300",
    });
  });

  it("leaves blank an ERP fiscal value the import would refuse, so the line still imports", () => {
    const fiscal = { ncm: "00000000", origin: 9, unit: "caixote", cest: "1" };
    const csv = buildErpCatalogCsv([{ ...ITEM, fiscal }], new Map([[ITEM.sku, 2500]]));

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.fiscal).toEqual({});
  });

  it.each([0, -1990, Number.NaN, 39.9])(
    "drops an ERP price of %s instead of suggesting it",
    (priceCents) => {
      const csv = buildErpCatalogCsv([{ ...ITEM, priceCents }], new Map([[ITEM.sku, 2500]]));

      const parsed = parseProductCsv(csv);

      expect(parsed.errors).toEqual([]);
      expect(parsed.rows[0]?.product.suggestedPriceCents).toBeUndefined();
    },
  );
});

describe("planErpCatalogImport", () => {
  it("keeps the reseller cost SellBridge has for a product it already sells", () => {
    const rows = planErpCatalogImport([ITEM], new Map([[ITEM.sku, 2500]]));

    expect(rows).toEqual([
      {
        sku: ITEM.sku,
        title: ITEM.title,
        imageUrl: "https://cdn.exemplo.com/a.jpg",
        erpPriceCents: 3990,
        currentCostCents: 2500,
        needsCost: false,
      },
    ]);
  });

  it("asks the reseller price of a product SellBridge does not have", () => {
    const rows = planErpCatalogImport([NEW_ITEM], new Map([[ITEM.sku, 2500]]));

    expect(rows[0]).toMatchObject({ currentCostCents: null, needsCost: true, erpPriceCents: 6990 });
  });

  it.each([0, -5, Number.NaN, null])("shows no ERP price when it is %s", (priceCents) => {
    const rows = planErpCatalogImport([{ ...NEW_ITEM, priceCents, imageUrls: [] }], new Map());

    expect(rows[0]).toMatchObject({ erpPriceCents: null, imageUrl: null });
  });
});

describe("mergeResellerCosts", () => {
  const existingCosts = new Map([[ITEM.sku, 2500]]);

  it("adds the typed price of a new product to the current costs", () => {
    const result = mergeResellerCosts({
      items: [ITEM, NEW_ITEM],
      existingCosts,
      typedCosts: [{ sku: NEW_ITEM.sku, costCents: 4500 }],
    });

    expect(result).toEqual({
      ok: true,
      costs: new Map([
        [ITEM.sku, 2500],
        [NEW_ITEM.sku, 4500],
      ]),
    });
  });

  it("refuses a price for a SKU outside this import", () => {
    const result = mergeResellerCosts({
      items: [ITEM],
      existingCosts,
      typedCosts: [{ sku: "OUTRO-SKU", costCents: 4500 }],
    });

    expect(result).toEqual({ ok: false, message: 'O SKU "OUTRO-SKU" não está nesta importação.' });
  });

  it("refuses a typed price for a product that keeps its current cost", () => {
    const result = mergeResellerCosts({
      items: [ITEM],
      existingCosts,
      typedCosts: [{ sku: ITEM.sku, costCents: 100 }],
    });

    expect(result.ok).toBe(false);
  });

  it("refuses the same SKU typed twice", () => {
    const result = mergeResellerCosts({
      items: [NEW_ITEM],
      existingCosts: new Map(),
      typedCosts: [
        { sku: NEW_ITEM.sku, costCents: 4500 },
        { sku: NEW_ITEM.sku, costCents: 100 },
      ],
    });

    expect(result.ok).toBe(false);
  });
});

describe("erpResellerCostsSchema", () => {
  it("accepts a price in whole cents", () => {
    const parsed = erpResellerCostsSchema.safeParse([{ sku: "SKU-1", costCents: 4590 }]);

    expect(parsed.success).toBe(true);
  });

  it.each([0, -100, 45.9, Number.NaN, 100_000_001])("refuses a price of %s cents", (costCents) => {
    const parsed = erpResellerCostsSchema.safeParse([{ sku: "SKU-1", costCents }]);

    expect(parsed.success).toBe(false);
  });

  it("refuses a blank SKU", () => {
    const parsed = erpResellerCostsSchema.safeParse([{ sku: "  ", costCents: 4590 }]);

    expect(parsed.success).toBe(false);
  });
});
