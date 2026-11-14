import { describe, expect, it } from "vitest";
import { formatCsvMoney, parseCsvMoney, parseProductCsv } from "./product-csv.ts";
import { type ProductExportSource, productExportRow } from "./supplier-panel-export.ts";
import { normalizeImportFile } from "./supplier-panel-import.ts";
import { buildImportTemplateCsv, buildProductExportCsv } from "./supplier-panel-import-files.ts";

const fullProduct: ProductExportSource = {
  sku: "VEST-MIDI-AZ",
  title: "Vestido midi viscose estampado - Azul",
  description: '- Viscose leve\n- Forro de algodão; "caimento" solto',
  costCents: 123_456,
  suggestedPriceCents: 249_990,
  stock: 37,
  categorySlug: "moda-feminina",
  imageUrls: ["https://exemplo.com/vestido-1.jpg", "https://exemplo.com/vestido-2.jpg"],
  active: false,
  mercadoLivreAttributes: {
    BRAND: "Ateliê Exemplo",
    MODEL: "VM-01",
    GTIN: "7891234567895",
    SELLER_PACKAGE_WEIGHT: "350 g",
    SELLER_PACKAGE_HEIGHT: "10 cm",
    SELLER_PACKAGE_WIDTH: "32.5 cm",
    SELLER_PACKAGE_LENGTH: "40 cm",
  },
  fiscal: {
    ncm: "62044200",
    origin: 0,
    unit: "UN",
    cest: "2806300",
    netWeightGrams: 300,
    cfopInState: "5102",
    cfopOutOfState: "6102",
    icmsCode: "102",
    pisCofinsCst: "49",
  },
};

const bareProduct: ProductExportSource = {
  sku: "BLUSA-01",
  title: "Blusa básica",
  description: "",
  costCents: 990,
  suggestedPriceCents: 1990,
  stock: 0,
  categorySlug: null,
  imageUrls: [],
  active: true,
  mercadoLivreAttributes: {},
  fiscal: {},
};

function importExported(products: readonly ProductExportSource[]) {
  const csv = buildProductExportCsv(products);
  const normalized = normalizeImportFile(new TextEncoder().encode(csv));
  return parseProductCsv(normalized.canonicalCsv);
}

function firstLine(csv: string): string {
  return csv.split("\r\n")[0] ?? "";
}

describe("product export", () => {
  it("is read back by the import with every value unchanged", () => {
    const parsed = importExported([fullProduct, bareProduct]);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((row) => row.product)).toEqual([
      {
        sku: "VEST-MIDI-AZ",
        title: "Vestido midi viscose estampado - Azul",
        description: '- Viscose leve\n- Forro de algodão; "caimento" solto',
        costCents: 123_456,
        suggestedPriceCents: 249_990,
        stock: 37,
        categorySlug: "moda-feminina",
        imageUrls: ["https://exemplo.com/vestido-1.jpg", "https://exemplo.com/vestido-2.jpg"],
        active: false,
        mercadoLivreAttributes: fullProduct.mercadoLivreAttributes,
        fiscal: fullProduct.fiscal,
      },
      {
        sku: "BLUSA-01",
        title: "Blusa básica",
        description: "",
        costCents: 990,
        suggestedPriceCents: 1990,
        stock: 0,
        categorySlug: null,
        imageUrls: [],
        active: true,
        mercadoLivreAttributes: {},
        fiscal: {},
      },
    ]);
  });

  it("starts with exactly the template's header", () => {
    const exported = buildProductExportCsv([bareProduct]);

    const template = buildImportTemplateCsv(null);

    expect(firstLine(exported)).toBe(firstLine(template));
  });

  it("writes one header line and no product lines for an empty list", () => {
    const exported = buildProductExportCsv([]);

    expect(exported.split("\r\n")).toEqual([firstLine(buildImportTemplateCsv(null)), ""]);
  });

  it("writes money in reais with a comma and no thousands separator", () => {
    const row = productExportRow(fullProduct);

    expect(row).toContain("1234,56");
    expect(row).toContain("2499,90");
  });

  it("keeps a title that starts like a formula as text", () => {
    const row = productExportRow({ ...bareProduct, title: '=HYPERLINK("x")', sku: "-01" });

    expect(row[0]).toBe("-01");
    expect(row[1]).toBe('\'=HYPERLINK("x")');
  });

  it("leaves blank a measure stored in a unit the import does not take", () => {
    const parsed = importExported([
      { ...bareProduct, mercadoLivreAttributes: { SELLER_PACKAGE_WEIGHT: "0.35 kg" } },
    ]);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.mercadoLivreAttributes).toEqual({});
  });
});

describe("formatCsvMoney", () => {
  it.each([0, 5, 90, 1990, 123_456, 100_000_000])("reads back %i cents exactly", (cents) => {
    const cell = formatCsvMoney(cents);

    const parsed = parseCsvMoney(cell);

    expect(parsed).toBe(cents);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("throws for %s", (cents) => {
    expect(() => formatCsvMoney(cents)).toThrow("non-negative integer");
  });
});
