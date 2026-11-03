import { readXlsxSheets, type XlsxSheet } from "../runtime/xlsx-reader.ts";
import { MAX_PRODUCT_CSV_ROWS } from "../schemas/admin-suppliers.ts";
import {
  buildCatalogImport,
  detectSpreadsheet,
  supplierCatalogRowCount,
  tooManyProductsError,
  type CatalogCategory,
  type CatalogImport,
} from "./catalog-spreadsheet.ts";
import { looksLikeZip } from "./supplier-panel-import-zip.ts";

/**
 * The supplier's EnvioVelox catalog, which the admin import already reads, turned into the product
 * CSV the supplier panel previews; null for any other file (the panel's own template, a CSV),
 * which goes through the panel's usual reading. The categories load only for a catalog.
 */
export async function readSupplierCatalogFile(
  bytes: Uint8Array,
  fileName: string,
  loadCategories: () => Promise<readonly CatalogCategory[]>,
): Promise<CatalogImport | null> {
  if (!looksLikeZip(bytes)) {
    return null;
  }
  const sheets = await readXlsxSheets(new Uint8Array(bytes));
  const catalogSheets: XlsxSheet[] = [];
  let productCount = 0;
  for (const sheet of sheets) {
    const rowCount = supplierCatalogRowCount(sheet);
    if (rowCount == null) {
      continue;
    }

    productCount += rowCount;
    if (productCount > MAX_PRODUCT_CSV_ROWS) {
      throw tooManyProductsError();
    }

    catalogSheets.push(sheet);
  }
  if (catalogSheets.length === 0) {
    return null;
  }

  const catalogs = catalogSheets.flatMap((sheet) => detectSpreadsheet(sheet, fileName) ?? []);
  return buildCatalogImport({ sheets: catalogs, categories: await loadCategories() });
}
