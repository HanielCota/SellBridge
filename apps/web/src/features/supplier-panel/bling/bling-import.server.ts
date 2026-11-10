import { findSupplierProductCostsBySku } from "@sellbridge/database/repositories";
import { readBlingCatalog, type SkippedBlingProduct } from "@sellbridge/marketplaces/bling";
import {
  buildErpCatalogCsv,
  mergeResellerCosts,
  planErpCatalogImport,
  type ErpCatalogItem,
  type ErpImportRow,
  type ErpResellerCost,
} from "@sellbridge/shared/erp-catalog";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { SupplierImportPreview } from "@sellbridge/shared/supplier-panel-import-schemas";
import { database } from "@/lib/server/database";
import { enqueueErpCatalogExport } from "@/lib/server/queues";
import { previewSupplierImport } from "@/features/supplier-panel/import/supplier-import.server";
import { blingCredentials, supplierBlingClient } from "./bling-access.server";

/**
 * Parents read per import. With their variations they stay under the import's 1000 rows for
 * typical catalogs, and at 3 requests per second the read takes about two minutes.
 */
const MAX_BLING_PRODUCTS = 300;

/**
 * The Bling catalog ready to import. Products the supplier already has keep the reseller cost
 * they have; new ones wait for the supplier to type it (`needsCost`), so `preview` only holds
 * products with a known reseller price and the usual confirmation (`supplierImportConfirm`)
 * never saves one without it.
 */
export interface BlingImportPlan {
  readonly rows: ErpImportRow[];
  /** The products as read, sent back with the typed prices (`previewBlingImportWithCosts`). */
  readonly items: ErpCatalogItem[];
  /** The import preview of the products that have a reseller price; null when none has. */
  readonly preview: SupplierImportPreview | null;
}

export interface BlingImportPreview extends BlingImportPlan {
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

async function previewPricedItems(
  supplierId: string,
  items: readonly ErpCatalogItem[],
  costs: ReadonlyMap<string, number>,
): Promise<SupplierImportPreview | null> {
  const priced = items.filter((item) => costs.has(item.sku));
  if (priced.length === 0) {
    return null;
  }
  const csv = buildErpCatalogCsv(priced, costs);
  return previewSupplierImport({
    supplierId,
    fileName: "bling.csv",
    fileBase64: Buffer.from(csv, "utf8").toString("base64"),
  });
}

/**
 * Plans the import of these ERP products: current costs come from SellBridge, typed ones only
 * for new products of this list. Fiscal data travels in `items` but is not imported yet: the
 * product has no fiscal columns until the fiscal-fields work adds them to `erp-catalog`.
 */
async function planImport(
  supplierId: string,
  items: readonly ErpCatalogItem[],
  typedCosts: readonly ErpResellerCost[],
): Promise<BlingImportPlan> {
  const existingCosts = await findSupplierProductCostsBySku(database, {
    supplierId,
    skus: items.map((item) => item.sku),
  });
  const merged = mergeResellerCosts({ items, existingCosts, typedCosts });
  if (!merged.ok) {
    throw validationError(merged.message);
  }
  const preview = await previewPricedItems(supplierId, items, merged.costs);
  const rows = planErpCatalogImport(items, existingCosts);
  logger.info("bling.import_planned", {
    supplierId,
    items: items.length,
    keepingCost: existingCosts.size,
    typedCosts: typedCosts.length,
    waitingForCost: items.length - merged.costs.size,
  });
  return { rows, items: [...items], preview };
}

/** Reads the supplier's Bling catalog and plans its import (see `BlingImportPlan`). */
export async function previewBlingImport(supplierId: string): Promise<BlingImportPreview> {
  const client = supplierBlingClient(supplierId, requireCredentials());
  const catalog = await readBlingCatalog(client, { maxProducts: MAX_BLING_PRODUCTS });
  const plan = await planImport(supplierId, catalog.items, []);
  logger.info("bling.import_previewed", {
    supplierId,
    skipped: catalog.skipped.length,
    truncated: catalog.truncated,
  });
  return { ...plan, skipped: catalog.skipped, truncated: catalog.truncated };
}

/**
 * The same plan with the reseller prices the supplier typed for new products. The items come
 * back from the screen: the supplier's own catalog, as trusted as a spreadsheet they upload,
 * and the import checks every product rule again.
 */
export async function previewBlingImportWithCosts(input: {
  supplierId: string;
  items: readonly ErpCatalogItem[];
  costs: readonly ErpResellerCost[];
}): Promise<BlingImportPlan> {
  return planImport(input.supplierId, input.items, input.costs);
}

/** Queues the sending of the products Bling does not have yet (worker `erp-catalog-export`). */
export async function requestBlingCatalogExport(supplierId: string): Promise<void> {
  requireCredentials();
  await enqueueErpCatalogExport({ supplierId });
}
