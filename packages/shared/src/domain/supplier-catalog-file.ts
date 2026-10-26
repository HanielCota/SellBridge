import { readXlsxSheets } from "../runtime/xlsx-reader.ts";
import {
  buildCatalogImport,
  detectSpreadsheet,
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
  const catalogs = sheets
    .flatMap((sheet) => detectSpreadsheet(sheet, fileName) ?? [])
    .filter((sheet) => sheet.kind === "supplier-catalog");
  if (catalogs.length === 0) {
    return null;
  }
  return buildCatalogImport({ sheets: catalogs, categories: await loadCategories() });
}
