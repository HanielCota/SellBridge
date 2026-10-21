import { describe, expect, it } from "vitest";
import {
  MAX_PRODUCT_CSV_BYTES,
  MAX_PRODUCT_CSV_ROWS,
  adminSupplierSearchSchema,
  adminSupplierValuesSchema,
} from "../schemas/admin-suppliers.ts";
import { parseCsvMoney, parseProductCsv, PRODUCT_CSV_TEMPLATE } from "./product-csv.ts";

const header = "sku;titulo;custo;estoque";

describe("product CSV", () => {
  it("parses both decimal separators exactly into integer cents", () => {
    expect(parseCsvMoney("12,90")).toBe(1290);
    expect(parseCsvMoney("12.90")).toBe(1290);
    expect(parseCsvMoney("12,9")).toBe(1290);
    expect(parseCsvMoney("12")).toBe(1200);
    expect(parseCsvMoney("0.29")).toBe(29);
    for (const invalid of ["1.234,56", "12.999", "-1", "NaN", "", "21474836.48"]) {
      expect(parseCsvMoney(invalid)).toBeNull();
    }
  });

  it("accepts the downloadable UTF-8 model and optional columns", () => {
    const parsed = parseProductCsv(PRODUCT_CSV_TEMPLATE);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product).toMatchObject({
      sku: "EXEMPLO-001",
      costCents: 1290,
      stock: 10,
      categorySlug: null,
      active: true,
      suggestedPriceCents: 1990,
    });
  });

  it("accepts comma-delimited files with quoted decimals, escaped quotes and multiline descriptions", () => {
    const parsed = parseProductCsv(
      'sku,titulo,custo,estoque,descricao\r\nA,"Produto, ""novo""","12,90",2,"Primeira\r\nsegunda"\r\nB,Outro,12.90,3,Fim',
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      line: 2,
      product: { title: 'Produto, "novo"', description: "Primeira\nsegunda", costCents: 1290 },
    });
    expect(parsed.rows[1]?.line).toBe(4);
  });

  it("reports physical line numbers and invalid fields without discarding other rows", () => {
    const parsed = parseProductCsv(
      `${header}\n\nA;Bom;12,90;1\nB;Ruim;xyz;-1\nC;Colunas;1\nD;Bom;12.90;0`,
    );
    expect(parsed.rows.map((row) => row.line)).toEqual([3, 6]);
    expect(parsed.errors).toEqual([
      { line: 4, reason: "Custo: valor inválido; Estoque: valor inválido" },
      { line: 5, reason: "Quantidade de colunas diferente do cabeçalho" },
    ]);
  });

  it("reports every invalid field in a row", () => {
    const parsed = parseProductCsv(`${header};gtin;peso_g\nA;Produto;xyz;-1;123;0`);
    expect(parsed.errors).toHaveLength(1);
    const reasons = parsed.errors[0]?.reason.split("; ") ?? [];
    expect(reasons).toEqual([
      "Custo: valor inválido",
      "Estoque: valor inválido",
      expect.stringMatching(/^GTIN: "123" não é um código de barras válido/),
      expect.stringMatching(/^Peso: "0" deve ser um número em gramas/),
    ]);
  });

  it("reports a line with zero cost as invalid", () => {
    const parsed = parseProductCsv(`${header}\nA;Primeiro;0;1\nB;Segundo;0,01;1`);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]?.line).toBe(2);
    expect(parsed.errors[0]?.reason).toBe("Custo: valor inválido");
  });

  it("rejects duplicated trimmed SKUs in the file", () => {
    const parsed = parseProductCsv(`${header}\nA;Primeiro;1;1\n A ;Segundo;2;2`);
    expect(parsed.errors).toEqual([{ line: 3, reason: "SKU duplicado no arquivo: A" }]);
  });

  it("validates image URLs, active flags and optional suggested prices", () => {
    const parsed = parseProductCsv(
      `${header};imagens;ativo;preco_sugerido\nA;Bom;1;2;https://example.com/1|https://example.com/2;nao;2.50\nB;Ruim;1;2;javascript:alert(1);talvez;abc`,
    );
    expect(parsed.rows[0]?.product).toMatchObject({
      active: false,
      imageUrls: ["https://example.com/1", "https://example.com/2"],
      suggestedPriceCents: 250,
    });
    expect(parsed.errors[0]?.reason).toContain("Imagens: valor inválido");
    expect(parsed.errors[0]?.reason).toContain("Ativo: valor inválido");
  });

  it("rejects malformed quotes and headers", () => {
    expect(parseProductCsv(`${header}\nA;"Aberto;1;1`).errors[0]?.reason).toBe(
      "Campo com aspas não foi fechado",
    );
    expect(parseProductCsv(`${header}\nA;"Fechado"x;1;1`).errors[0]?.reason).toBe(
      "Aspas inválidas no CSV",
    );
    for (const invalid of [
      "",
      header,
      "sku;sku;titulo;custo;estoque\nA;A;T;1;1",
      "sku;nome;custo;estoque\nA;T;1;1",
    ]) {
      expect(() => parseProductCsv(invalid)).toThrow(/CSV|produtos/);
    }
  });

  it("enforces the product count, including invalid rows", () => {
    const rows = Array.from({ length: MAX_PRODUCT_CSV_ROWS }, (_, index) => `${index};Produto;1;1`);
    expect(parseProductCsv([header, ...rows].join("\n")).rows).toHaveLength(MAX_PRODUCT_CSV_ROWS);
    expect(() => parseProductCsv([header, ...rows, "Ruim"].join("\n"))).toThrow("no máximo 1000");
  });

  it("enforces bytes rather than character count for accented text", () => {
    expect(() => parseProductCsv("á".repeat(MAX_PRODUCT_CSV_BYTES / 2 + 1))).toThrow("2 MiB");
  });
});

describe("admin catalog schemas", () => {
  it("falls back for invalid search parameters", () => {
    expect(adminSupplierSearchSchema.parse({ query: 5, page: "abc", pageSize: 500 })).toEqual({
      query: undefined,
      page: 1,
      pageSize: 20,
    });
  });
  it("asks only where the supplier ships from, with no delivery area", () => {
    const values = {
      name: "Teste",
      niche: "Teste",
      description: "",
      state: "SP",
      city: "São Paulo",
      logoUrl: null,
      contactEmail: null,
      acceptWithinHours: 24,
      dispatchWithinHours: 48,
    };
    expect(adminSupplierValuesSchema.parse(values)).toEqual(values);
    expect(adminSupplierValuesSchema.safeParse({ ...values, city: " " }).success).toBe(false);
  });

  it("refuses a line with more columns than any import needs, before the import blocks", () => {
    const columns = "sku;titulo;custo;estoque";
    expect(() =>
      parseProductCsv(`${columns}
A;B;1;1${";".repeat(60)}`),
    ).toThrow("no máximo 50 colunas");
    expect(() =>
      parseProductCsv(`${columns}
${";".repeat(2_000_000)}`),
    ).toThrow("no máximo 50 colunas");
  });

  it("caps cost and suggested price at the listing ceiling", () => {
    expect(parseCsvMoney("1000000,00")).toBe(100_000_000);
    expect(parseCsvMoney("1000000,01")).toBeNull();
  });
});
