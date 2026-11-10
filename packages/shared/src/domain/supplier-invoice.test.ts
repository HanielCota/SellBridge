import { describe, expect, it } from "vitest";
import { EMPTY_PRODUCT_FISCAL, type ProductFiscal } from "./product-fiscal.ts";
import { suggestedTaxDefaults } from "./supplier-fiscal.ts";
import {
  blingInvoiceOutcome,
  invoiceCfopProblem,
  MissingInvoiceDataError,
  nextInvoiceAttemptAt,
  resolveInvoiceItemTax,
} from "./supplier-invoice.ts";

const DEFAULTS = suggestedTaxDefaults("simples");
const PRODUCT: ProductFiscal = { ...EMPTY_PRODUCT_FISCAL, ncm: "64029990", origin: 0, unit: "PAR" };

describe("resolveInvoiceItemTax", () => {
  it("uses the in-state CFOP when the supplier and the recipient share the state", () => {
    const tax = resolveInvoiceItemTax({
      sku: "SB-1",
      product: PRODUCT,
      defaults: DEFAULTS,
      supplierState: "MG",
      recipientState: "mg",
    });

    expect(tax.cfop).toBe("5102");
  });

  it("uses the out-of-state CFOP when the recipient is in another state", () => {
    const tax = resolveInvoiceItemTax({
      sku: "SB-1",
      product: PRODUCT,
      defaults: DEFAULTS,
      supplierState: "MG",
      recipientState: "SP",
    });

    expect(tax.cfop).toBe("6102");
  });

  it("lets the product's own codes beat the supplier's defaults", () => {
    const product = {
      ...PRODUCT,
      cfopOutOfState: "6108",
      icmsCode: "500",
      pisCofinsCst: "07",
    };

    const tax = resolveInvoiceItemTax({
      sku: "SB-1",
      product,
      defaults: DEFAULTS,
      supplierState: "MG",
      recipientState: "SP",
    });

    expect(tax).toMatchObject({ cfop: "6108", icmsCode: "500", pisCofinsCst: "07", unit: "PAR" });
  });

  it("falls back to the supplier's origin and unit when the product has none", () => {
    const product = { ...PRODUCT, origin: null, unit: null };

    const tax = resolveInvoiceItemTax({
      sku: "SB-1",
      product,
      defaults: DEFAULTS,
      supplierState: "MG",
      recipientState: "MG",
    });

    expect(tax).toMatchObject({ origin: 0, unit: "UN" });
  });

  it("throws MissingInvoiceDataError when the product has no NCM", () => {
    const product = { ...PRODUCT, ncm: null };

    const resolve = () =>
      resolveInvoiceItemTax({
        sku: "SB-9",
        product,
        defaults: DEFAULTS,
        supplierState: "MG",
        recipientState: "MG",
      });

    expect(resolve).toThrow(MissingInvoiceDataError);
  });
});

describe("blingInvoiceOutcome", () => {
  it.each([
    [5, "authorized"],
    [6, "authorized"],
    [2, "cancelled"],
    [1, "editable"],
    [4, "refused"],
    [9, "refused"],
    [11, "refused"],
    [3, "waiting"],
    [8, "waiting"],
    [10, "waiting"],
  ] as const)("reads situacao %i as %s", (situacao, outcome) => {
    expect(blingInvoiceOutcome(situacao)).toBe(outcome);
  });
});

describe("nextInvoiceAttemptAt", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  it("waits 2 minutes after the first failure", () => {
    expect(nextInvoiceAttemptAt(1, now).toISOString()).toBe("2026-11-10T12:02:00.000Z");
  });

  it("doubles the wait after each failure", () => {
    expect(nextInvoiceAttemptAt(3, now).toISOString()).toBe("2026-11-10T12:08:00.000Z");
  });

  it("never waits more than an hour", () => {
    expect(nextInvoiceAttemptAt(20, now).toISOString()).toBe("2026-11-10T13:00:00.000Z");
  });

  it("throws RangeError when attempts is zero", () => {
    expect(() => nextInvoiceAttemptAt(0, now)).toThrow(RangeError);
  });
});

describe("invoiceCfopProblem", () => {
  it("returns null when every line carries the expected CFOP", () => {
    const problem = invoiceCfopProblem([{ sku: "SB-1", expectedCfop: "6102", actualCfop: "6102" }]);

    expect(problem).toBeNull();
  });

  it("names the product and both CFOPs when the ERP chose another one", () => {
    const problem = invoiceCfopProblem([
      { sku: "SB-1", expectedCfop: "6102", actualCfop: "6102" },
      { sku: "SB-2", expectedCfop: "6102", actualCfop: "6405" },
    ]);

    expect(problem).toContain("SB-2");
    expect(problem).toContain("6405");
    expect(problem).toContain("6102");
  });

  it("holds back a line the ERP left without a CFOP", () => {
    const problem = invoiceCfopProblem([{ sku: "SB-1", expectedCfop: "5102", actualCfop: null }]);

    expect(problem).toContain("sem CFOP");
  });
});
