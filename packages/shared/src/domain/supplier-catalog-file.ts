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
 * which goes through the panel's usual reading. The categories load only for a catalog. With
 * `gridColumns`, a product in several colours or sizes comes out as one grid, unless one of its
 * SKUs is already sold as a product of its own (`loadSingleSkus`).
 */
export async function readSupplierCatalogFile(
  bytes: Uint8Array,
  fileName: string,
  loadCategories: () => Promise<readonly CatalogCategory[]>,
  options: {
    readonly gridColumns?: boolean;
    /** Of these SKUs, the ones the supplier already sells as products of their own. */
    readonly loadSingleSkus?: (skus: readonly string[]) => Promise<ReadonlySet<string>>;
  } = {},
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
  const gridColumns = options.gridColumns === true;
  const skus = catalogs.flatMap((sheet) => sheet.rows.map((row) => row.values.get("sku") ?? ""));
  const [categories, singleSkus] = await Promise.all([
    loadCategories(),
    gridColumns && options.loadSingleSkus !== undefined
      ? options.loadSingleSkus(skus.filter((sku) => sku.trim() !== ""))
      : Promise.resolve(new Set<string>()),
  ]);
  return buildCatalogImport({ sheets: catalogs, categories, gridColumns, singleSkus });
}
