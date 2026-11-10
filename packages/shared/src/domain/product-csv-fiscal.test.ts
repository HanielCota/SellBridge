import { describe, expect, it } from "vitest";
import { parseCsvFiscal } from "./product-csv-fiscal.ts";
import { parseProductCsv } from "./product-csv.ts";

describe("parseCsvFiscal", () => {
  it("reads the fiscal cells a line fills and leaves blank ones out", () => {
    const result = parseCsvFiscal({ ncm: "6402.99.90", origem: "0 – Nacional", unidade: "par" });

    expect(result).toEqual({ fiscal: { ncm: "64029990", origin: 0, unit: "PAR" } });
  });

  it("names every bad fiscal cell at once", () => {
    const result = parseCsvFiscal({ ncm: "00000000", unidade: "caixote", cfop_estado: "6102" });

    expect(result).toHaveProperty("reason");
    const reason = "reason" in result ? result.reason : "";
    expect(reason).toContain("NCM");
    expect(reason).toContain("Unidade");
    expect(reason).toContain("CFOP dentro do estado");
  });

  it("reads a line without fiscal cells as no change", () => {
    expect(parseCsvFiscal({})).toEqual({ fiscal: {} });
  });
});

describe("parseProductCsv with fiscal columns", () => {
  it("carries the fiscal data and SEM GTIN of a line", () => {
    const csv =
      "sku;titulo;custo;estoque;gtin;ncm;origem;unidade;peso_liquido_g\n" +
      "TEN-01;Tênis casual branco;39,90;5;SEM GTIN;6404.11.00;0;PAR;450\n";

    const parsed = parseProductCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.fiscal).toEqual({
      ncm: "64041100",
      origin: 0,
      unit: "PAR",
      netWeightGrams: 450,
    });
    expect(parsed.rows[0]?.product.mercadoLivreAttributes).toEqual({ GTIN: "SEM GTIN" });
  });

  it("refuses a line whose NCM is all zeros", () => {
    const csv = "sku;titulo;custo;estoque;ncm\nTEN-01;Tênis casual branco;39,90;5;00000000\n";

    const parsed = parseProductCsv(csv);

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0]?.reason).toContain("NCM");
  });
});
