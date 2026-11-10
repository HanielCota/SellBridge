import { readBlingCatalog, type SkippedBlingProduct } from "@sellbridge/marketplaces/bling";
import { buildErpCatalogCsv } from "@sellbridge/shared/erp-catalog";
import { conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { SupplierImportPreview } from "@sellbridge/shared/supplier-panel-import-schemas";
import { enqueueErpCatalogExport } from "@/lib/server/queues";
import { previewSupplierImport } from "@/features/supplier-panel/import/supplier-import.server";
import { blingCredentials, supplierBlingClient } from "./bling-access.server";

/**
 * Parents read per import. With their variations they stay under the import's 1000 rows for
 * typical catalogs, and at 3 requests per second the read takes about two minutes.
 */
const MAX_BLING_PRODUCTS = 300;

export interface BlingImportPreview {
  readonly preview: SupplierImportPreview;
  /** Bling products left out before the preview (no code), named for the supplier. */
  readonly skipped: SkippedBlingProduct[];
  /** The catalog had more than `MAX_BLING_PRODUCTS` products; the rest needs another round. */
  readonly truncated: boolean;
}

function requireCredentials() {
  const credentials = blingCredentials();
  if (credentials === null) {
    throw conflictError("A integração com o Bling ainda não está disponível.");
  }
  return credentials;
}

/**
 * Reads the supplier's Bling catalog and previews it exactly as an uploaded spreadsheet: same
 * rules, same error list, and the same confirmation (`supplierImportConfirm`) imports it.
 *
 * Fiscal data (NCM, origin, unit) is read too but not imported yet: the product has no fiscal
 * columns until the fiscal-fields work adds them to the product import and to `erp-catalog`.
 */
export async function previewBlingImport(supplierId: string): Promise<BlingImportPreview> {
  const client = supplierBlingClient(supplierId, requireCredentials());
  const catalog = await readBlingCatalog(client, { maxProducts: MAX_BLING_PRODUCTS });
  const csv = buildErpCatalogCsv(catalog.items);
  const preview = await previewSupplierImport({
    supplierId,
    fileName: "bling.csv",
    fileBase64: Buffer.from(csv, "utf8").toString("base64"),
  });
  logger.info("bling.import_previewed", {
    supplierId,
    items: catalog.items.length,
    skipped: catalog.skipped.length,
    truncated: catalog.truncated,
  });
  return { preview, skipped: catalog.skipped, truncated: catalog.truncated };
}

/** Queues the sending of the products Bling does not have yet (worker `erp-catalog-export`). */
export async function requestBlingCatalogExport(supplierId: string): Promise<void> {
  requireCredentials();
  await enqueueErpCatalogExport({ supplierId });
}
