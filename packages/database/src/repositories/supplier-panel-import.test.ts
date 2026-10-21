import { randomUUID } from "node:crypto";
import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { normalizeImportFile } from "@sellbridge/shared/supplier-panel-import";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { importSupplierProducts, saveAdminSupplier } from "./admin-suppliers.ts";

/**
 * Importing the same spreadsheet twice must not duplicate the catalog: the SKU is unique per
 * supplier (supplier_products_sku_idx) and the import upserts on it.
 */
const database = createTestDatabase();
let supplierId = "";

const excelFile = Buffer.from(
  [
    "sku;titulo;descricao;custo;estoque",
    "REIMP-1;Pão de queijo;Congelado 1 kg;19,90;10",
    "REIMP-2;Café torrado;Moído 500 g;24,50;4",
  ].join("\r\n"),
  "latin1",
);

async function importFile(bytes: Uint8Array) {
  const normalized = normalizeImportFile(bytes);
  return await importSupplierProducts(database, {
    supplierId,
    rows: parseProductCsv(normalized.canonicalCsv).rows,
    validatePreview: () => undefined,
  });
}

async function catalog() {
  return await database
    .select({
      sku: supplierProducts.sku,
      title: supplierProducts.title,
      stock: supplierProducts.stock,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierId, supplierId))
    .orderBy(supplierProducts.sku);
}

beforeAll(async () => {
  const supplier = await saveAdminSupplier(database, {
    name: `Importação teste ${randomUUID()}`,
    niche: "Teste",
    description: "",
    state: "MG",
    city: "Belo Horizonte",
    logoUrl: null,
    contactEmail: null,
    acceptWithinHours: 12,
    dispatchWithinHours: 36,
  });
  supplierId = supplier.id;
});
afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

describe("supplier spreadsheet re-import", () => {
  it("updates the same products instead of creating them again", async () => {
    const first = await importFile(excelFile);
    const second = await importFile(excelFile);
    expect([first.created, first.updated]).toEqual([2, 0]);
    expect([second.created, second.updated]).toEqual([0, 2]);
    expect(await catalog()).toEqual([
      { sku: "REIMP-1", title: "Pão de queijo", stock: 10 },
      { sku: "REIMP-2", title: "Café torrado", stock: 4 },
    ]);
  });

  it("applies a corrected value on the next import of the same SKU", async () => {
    const corrected = Buffer.from(
      "sku;titulo;custo;estoque\r\nREIMP-1;Pão de queijo;19,90;7",
      "latin1",
    );
    await importFile(corrected);
    const products = await catalog();
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ sku: "REIMP-1", stock: 7 });
  });
});
