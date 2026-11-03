import { describe, expect, it, vi } from "vitest";
import { readSupplierCatalogFile } from "./supplier-catalog-file.ts";
import { normalizeImportFile } from "./supplier-panel-import.ts";
import { buildXlsx, utf8 } from "./supplier-panel-import.fixtures.ts";

const categories = async () => [{ slug: "calcados", name: "Calçados" }];
const envioVeloxHeader = [
  "SKU",
  "Nome produto",
  "Descrição",
  "Preço de custo",
  "Preço de venda",
  "Estoque",
  "URL Imagem 1",
  "Categoria Pai",
];

/*
 * Regression: the supplier panel refused the EnvioVelox catalog the admin import already reads,
 * so a supplier with that export could not import their own products.
 */
describe("readSupplierCatalogFile", () => {
  it("turns the EnvioVelox catalog into rows the panel's preview accepts", async () => {
    const file = buildXlsx([
      envioVeloxHeader,
      ["TEN-37", "Tênis casual", "Confortável", 0, 39.9, 12, "https://img.test/a.jpg", "Calçados"],
      ["TEN-38", "Tênis casual", "Confortável", 0, 39.9, 4, "https://img.test/b.jpg", "Calçados"],
    ]);

    const converted = await readSupplierCatalogFile(file, "envio.xlsx", categories);

    expect(converted?.productCount).toBe(2);
    expect(converted?.lines.map((line) => line.rowNumber)).toEqual([2, 3]);
    const normalized = normalizeImportFile(utf8(converted?.csv ?? ""));
    expect(normalized.records.size).toBe(2);
  });

  // Regression (security audit, 31/10/2026): every row got a map as wide as the header, and the
  // categories were loaded, before the product limit was checked.
  it("refuses a catalog past the product limit before loading categories", async () => {
    const rows = Array.from({ length: 1001 }, (_row, index) => [`S-${index}`, "Produto", 1, 1]);
    const file = buildXlsx([["SKU", "Nome produto", "Preço de venda", "Estoque"], ...rows]);
    const loadCategories = vi.fn<typeof categories>(categories);

    const reading = readSupplierCatalogFile(file, "envio.xlsx", loadCategories);

    await expect(reading).rejects.toMatchObject({
      userMessage: expect.stringContaining("no máximo 1000 produtos"),
    });
    expect(loadCategories).not.toHaveBeenCalled();
  });

  it("leaves the panel's own template to the usual reading", async () => {
    const file = buildXlsx([
      ["sku", "titulo", "custo", "estoque"],
      ["A-1", "Produto", "12,90", 1],
    ]);
    expect(await readSupplierCatalogFile(file, "modelo.xlsx", categories)).toBeNull();
    expect(await readSupplierCatalogFile(utf8("sku;titulo\nA;B"), "a.csv", categories)).toBeNull();
  });
});
