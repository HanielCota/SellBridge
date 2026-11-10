import {
  listSupplierProductsForErpExport,
  type CatalogExportProduct,
} from "@sellbridge/database/repositories";
import { isMarketplaceAuthError, isRetryableError } from "@sellbridge/marketplaces";
import {
  BLING_RECONNECT_MESSAGE,
  type BlingClient,
  type BlingNewProduct,
} from "@sellbridge/marketplaces/bling";
import { hasErrorCode } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { erpCatalogExportJobSchema } from "@sellbridge/shared/queues";
import { supplierBlingClient, type ErpBlingDependencies } from "./erp-bling-client.ts";

export type ErpCatalogExportDependencies = ErpBlingDependencies;

export interface ErpCatalogExportSummary {
  created: number;
  alreadyInErp: number;
  refused: number;
}

const PRODUCTS_PER_PAGE = 100;
/** SKUs per `GET /produtos?codigos[]=` lookup, keeping the URL short. */
const CODES_PER_LOOKUP = 20;

/** "350 g", as the product import stores the package weight; null when absent or unreadable. */
export function gramsFromAttribute(value: string | undefined): number | null {
  const match = /^(\d+(?:[.,]\d+)?)\s*g$/i.exec((value ?? "").trim());
  if (match?.[1] === undefined) {
    return null;
  }
  const grams = Number(match[1].replace(",", "."));
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

/**
 * Bling's price is the supplier's retail price (the import reads it back as the suggested price);
 * the reseller cost stays in SellBridge and never reaches the ERP.
 */
export function toBlingNewProduct(product: CatalogExportProduct): BlingNewProduct {
  return {
    sku: product.sku,
    title: product.title,
    description: product.description,
    priceCents: product.suggestedPriceCents,
    imageUrls: product.imageUrls,
    gtin: product.attributes.GTIN ?? null,
    brand: product.attributes.BRAND ?? null,
    weightGrams: gramsFromAttribute(product.attributes.SELLER_PACKAGE_WEIGHT),
  };
}

function chunks<Item>(items: readonly Item[], size: number): Item[][] {
  const result: Item[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

async function skusInBling(client: BlingClient, skus: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const group of chunks(skus, CODES_PER_LOOKUP)) {
    const existing = await client.findProductsByCodes(group);
    for (const product of existing) {
      if (product.codigo != null) {
        found.add(product.codigo);
      }
    }
  }
  return found;
}

/** The account itself was refused (expired or revoked), not this product: every other one would fail too. */
function isLostConnection(error: unknown): boolean {
  if (isMarketplaceAuthError(error)) {
    return true;
  }
  return hasErrorCode(error, "CONFLICT") && error.userMessage === BLING_RECONNECT_MESSAGE;
}

/**
 * Creates one product. A refusal for this product's data (400) is counted and the rest go on; a
 * passing failure or a lost connection stops the job, which BullMQ retries.
 */
async function createOne(
  client: BlingClient,
  product: CatalogExportProduct,
): Promise<"created" | "refused"> {
  try {
    await client.createProduct(toBlingNewProduct(product));
    return "created";
  } catch (error) {
    if (isRetryableError(error) || isLostConnection(error)) {
      throw error;
    }
    logger.warn("erp.catalog_export_refused", { productId: product.id, error });
    return "refused";
  }
}

async function exportPage(
  client: BlingClient,
  page: readonly CatalogExportProduct[],
): Promise<ErpCatalogExportSummary> {
  const existing = await skusInBling(
    client,
    page.map((product) => product.sku),
  );
  const counts: ErpCatalogExportSummary = { created: 0, alreadyInErp: 0, refused: 0 };
  for (const product of page) {
    if (existing.has(product.sku)) {
      counts.alreadyInErp += 1;
      continue;
    }
    counts[await createOne(client, product)] += 1;
  }
  return counts;
}

function addCounts(
  total: ErpCatalogExportSummary,
  page: ErpCatalogExportSummary,
): ErpCatalogExportSummary {
  return {
    created: total.created + page.created,
    alreadyInErp: total.alreadyInErp + page.alreadyInErp,
    refused: total.refused + page.refused,
  };
}

/**
 * Sends the supplier's active products that Bling does not have yet (matched by SKU). Products
 * already in Bling are never changed: Bling is the source of truth for the catalog.
 */
export function createErpCatalogExportProcessor(dependencies: ErpCatalogExportDependencies) {
  return async function processErpCatalogExport(data: unknown): Promise<ErpCatalogExportSummary> {
    const { supplierId } = erpCatalogExportJobSchema.parse(data);
    let summary: ErpCatalogExportSummary = { created: 0, alreadyInErp: 0, refused: 0 };
    const credentials = dependencies.blingCredentials;
    if (credentials === null) {
      logger.warn("erp.catalog_export_unconfigured", { supplierId });
      return summary;
    }
    const client = supplierBlingClient(
      { ...dependencies, blingCredentials: credentials },
      supplierId,
    );
    let afterId: string | null = null;
    for (;;) {
      const page = await listSupplierProductsForErpExport(dependencies.database, {
        supplierId,
        afterId,
        limit: PRODUCTS_PER_PAGE,
      });
      summary = addCounts(summary, await exportPage(client, page));
      if (page.length < PRODUCTS_PER_PAGE) {
        break;
      }
      afterId = page.at(-1)?.id ?? null;
    }
    logger.info("erp.catalog_exported", { supplierId, ...summary });
    return summary;
  };
}
