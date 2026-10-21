import { describe, expect, it } from "vitest";
import { isValidGtin } from "./product-csv-attributes.ts";
import { parseProductCsv, PRODUCT_CSV_TEMPLATE } from "./product-csv.ts";

const header =
  "sku;titulo;custo;estoque;marca;modelo;gtin;peso_g;altura_cm;largura_cm;comprimento_cm";

describe("product CSV Mercado Livre attributes (item 18)", () => {
  it("turns brand, model, GTIN, weight and dimensions into Mercado Livre attributes", () => {
    const parsed = parseProductCsv(
      `${header}\nTEN-1;Tênis corrida;89,90;5;Passo Leve;PL-200;7891234567895;850;12;20;32,5`,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.mercadoLivreAttributes).toEqual({
      BRAND: "Passo Leve",
      MODEL: "PL-200",
      GTIN: "7891234567895",
      SELLER_PACKAGE_WEIGHT: "850 g",
      SELLER_PACKAGE_HEIGHT: "12 cm",
      SELLER_PACKAGE_WIDTH: "20 cm",
      SELLER_PACKAGE_LENGTH: "32.5 cm",
    });
  });

  it("leaves blank attribute cells out, so an update keeps what the product has", () => {
    const parsed = parseProductCsv(`${header}\nTEN-1;Tênis;89,90;5;Passo Leve;;;;;;`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.mercadoLivreAttributes).toEqual({ BRAND: "Passo Leve" });
  });

  it("refuses each bad attribute on its own line, saying which column and what it expects", () => {
    const parsed = parseProductCsv(
      [
        header,
        "A;Produto A;10;1;Marca;Modelo;7891234567890;850;12;20;30",
        "B;Produto B;10;1;Marca;Modelo;7891234567895;0;12;20;30",
        "C;Produto C;10;1;Marca;Modelo;7891234567895;850;12;-3;30",
        "D;Produto D;10;1;Marca;Modelo;7891234567895;850;12;20;30",
      ].join("\n"),
    );
    expect(parsed.rows.map((row) => row.product.sku)).toEqual(["D"]);
    expect(parsed.errors).toEqual([
      { line: 2, reason: expect.stringMatching(/GTIN.*7891234567890.*dígito verificador/) },
      { line: 3, reason: expect.stringMatching(/Peso.*0.*gramas/) },
      { line: 4, reason: expect.stringMatching(/Largura.*-3.*centímetros/) },
    ]);
  });

  it("ships the new columns in the downloadable model", () => {
    const parsed = parseProductCsv(PRODUCT_CSV_TEMPLATE);
    expect(parsed.errors).toEqual([]);
    expect(Object.keys(parsed.rows[0]?.product.mercadoLivreAttributes ?? {})).toEqual(
      expect.arrayContaining(["BRAND", "MODEL", "GTIN", "SELLER_PACKAGE_WEIGHT"]),
    );
  });

  it("checks GTIN-8, 12, 13 and 14 by their check digit", () => {
    for (const valid of ["96385074", "036000291452", "7891234567895", "17891234567892"]) {
      expect(isValidGtin(valid)).toBe(true);
    }
    for (const invalid of ["96385075", "7891234567890", "789123456789", "ABC12345", ""]) {
      expect(isValidGtin(invalid)).toBe(false);
    }
  });
});
