import type { ErpImportRow } from "@sellbridge/shared/erp-catalog";
import { describe, expect, it } from "vitest";
import { pricedImport, pricesFromDiscount, typedCents } from "./bling-prices";

function row(sku: string, overrides: Partial<ErpImportRow> = {}): ErpImportRow {
  return {
    sku,
    title: sku,
    imageUrl: null,
    erpPriceCents: 3990,
    currentCostCents: null,
    needsCost: true,
    ...overrides,
  };
}

const rows = [
  row("NOVO-1"),
  row("NOVO-2", { erpPriceCents: 6990 }),
  row("SEM-PRECO", { erpPriceCents: null }),
  row("JA-TEM", { currentCostCents: 2500, needsCost: false }),
];

describe("pricesFromDiscount", () => {
  it("fills every new product with the ERP price minus the discount", () => {
    const prices = pricesFromDiscount(rows, new Map(), 300);

    expect(Object.fromEntries(prices)).toEqual({ "NOVO-1": "27,93", "NOVO-2": "48,93" });
  });

  it("replaces a price typed before but leaves a product without an ERP price alone", () => {
    const typed = new Map([
      ["NOVO-1", "10,00"],
      ["SEM-PRECO", "15,00"],
    ]);

    const prices = pricesFromDiscount(rows, typed, 0);

    expect(prices.get("NOVO-1")).toBe("39,90");
    expect(prices.get("SEM-PRECO")).toBe("15,00");
  });
});

describe("typedCents", () => {
  it("reads a Brazilian amount and refuses blank, zero or text", () => {
    expect(typedCents("24,90")).toBe(2490);
    expect(typedCents("1.259,90")).toBe(125_990);
    expect(typedCents(undefined)).toBeNull();
    expect(typedCents("  ")).toBeNull();
    expect(typedCents("0,00")).toBeNull();
    expect(typedCents("abc")).toBeNull();
  });
});

describe("pricedImport", () => {
  it("counts the new products still without a price and sends only the priced ones", () => {
    const typed = new Map([
      ["NOVO-1", "24,90"],
      ["NOVO-2", ""],
    ]);

    const priced = pricedImport(rows, typed);

    expect(priced).toEqual({ costs: [{ sku: "NOVO-1", costCents: 2490 }], missing: 2 });
  });

  it("is ready to import once every new product has a price", () => {
    const typed = pricesFromDiscount(rows, new Map([["SEM-PRECO", "15,00"]]), 300);

    const priced = pricedImport(rows, typed);

    expect(priced.missing).toBe(0);
    expect(priced.costs).toHaveLength(3);
  });
});
