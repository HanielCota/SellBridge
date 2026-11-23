import {
  listSupplierProductsForErpExport,
  saveErpCatalogExportResult,
  type CatalogExportProduct,
} from "@sellbridge/database/repositories";
import { isMarketplaceAuthError, isRetryableError } from "@sellbridge/marketplaces";
import {
  BLING_RECONNECT_MESSAGE,
  type BlingClient,
  type BlingNewProduct,
} from "@sellbridge/marketplaces/bling";
import {
  type ErpCatalogExportResult,
  MAX_REFUSED_PRODUCTS_LISTED,
  type RefusedErpProduct,
} from "@sellbridge/shared/erp-catalog-export";
import { hasErrorCode, isAppError, userMessageOr } from "@sellbridge/shared/errors";
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

const REFUSED_FALLBACK_REASON = "O Bling recusou este produto sem dizer o motivo.";
const FAILED_FALLBACK_REASON =
  'O envio ao Bling parou por uma falha. Clique em "Enviar ao Bling o que falta lá" para tentar de novo.';

/** Bling's own words about the product (its field messages), never the HTTP status. */
function refusalReason(error: unknown): string {
  const issues = isAppError(error) ? (error.details.issues ?? []) : [];
  return issues.length === 0 ? REFUSED_FALLBACK_REASON : issues.join(" ");
}

type CreateOutcome = { kind: "created" } | { kind: "refused"; reason: string };

/**
 * Creates one product. A refusal for this product's data (400) is counted with Bling's reason and
 * the rest go on; a passing failure or a lost connection stops the job, which BullMQ retries.
 */
async function createOne(
  client: BlingClient,
  product: CatalogExportProduct,
): Promise<CreateOutcome> {
  try {
    await client.createProduct(toBlingNewProduct(product));
    return { kind: "created" };
  } catch (error) {
    if (isRetryableError(error) || isLostConnection(error)) {
      throw error;
    }
    logger.warn("erp.catalog_export_refused", { productId: product.id, error });
    return { kind: "refused", reason: refusalReason(error) };
  }
}

interface ExportTally {
  readonly summary: ErpCatalogExportSummary;
  /** The first refused products, with why, for the supplier's card. */
  readonly refusedProducts: readonly RefusedErpProduct[];
}

const EMPTY_TALLY: ExportTally = {
  summary: { created: 0, alreadyInErp: 0, refused: 0 },
  refusedProducts: [],
};

function withRefused(
  tally: ExportTally,
  product: CatalogExportProduct,
  reason: string,
): ExportTally {
  const listed =
    tally.refusedProducts.length < MAX_REFUSED_PRODUCTS_LISTED
      ? [...tally.refusedProducts, { sku: product.sku, title: product.title, reason }]
      : tally.refusedProducts;
  return {
    summary: { ...tally.summary, refused: tally.summary.refused + 1 },
    refusedProducts: listed,
  };
}

async function exportPage(
  client: BlingClient,
  page: readonly CatalogExportProduct[],
  start: ExportTally,
): Promise<ExportTally> {
  const existing = await skusInBling(
    client,
    page.map((product) => product.sku),
  );
  let tally = start;
  for (const product of page) {
    if (existing.has(product.sku)) {
      tally = {
        ...tally,
        summary: { ...tally.summary, alreadyInErp: tally.summary.alreadyInErp + 1 },
      };
      continue;
    }
    const outcome = await createOne(client, product);
    if (outcome.kind === "refused") {
      tally = withRefused(tally, product, outcome.reason);
      continue;
    }
    tally = { ...tally, summary: { ...tally.summary, created: tally.summary.created + 1 } };
  }
  return tally;
}

function doneResult(tally: ExportTally): ErpCatalogExportResult {
  return {
    kind: "done",
    created: tally.summary.created,
    alreadyInErp: tally.summary.alreadyInErp,
    refusedTotal: tally.summary.refused,
    refused: [...tally.refusedProducts],
  };
}

async function exportCatalog(
  client: BlingClient,
  input: { dependencies: ErpCatalogExportDependencies; supplierId: string },
): Promise<ExportTally> {
  let tally = EMPTY_TALLY;
  let afterId: string | null = null;
  for (;;) {
    const page = await listSupplierProductsForErpExport(input.dependencies.database, {
      supplierId: input.supplierId,
      afterId,
      limit: PRODUCTS_PER_PAGE,
    });
    tally = await exportPage(client, page, tally);
    if (page.length < PRODUCTS_PER_PAGE) {
      return tally;
    }
    afterId = page.at(-1)?.id ?? null;
  }
}

/** Where the job stands: on its last attempt a failure is final, and the supplier sees why. */
export interface ErpCatalogExportAttempt {
  readonly isLast: boolean;
}

/**
 * Sends the supplier's active products that Bling does not have yet (matched by SKU). Products
 * already in Bling are never changed: Bling is the source of truth for the catalog. The result
 * (or, on the last attempt, why it failed) is kept for the supplier's Bling card.
 */
export function createErpCatalogExportProcessor(dependencies: ErpCatalogExportDependencies) {
  return async function processErpCatalogExport(
    data: unknown,
    attempt: ErpCatalogExportAttempt = { isLast: false },
  ): Promise<ErpCatalogExportSummary> {
    const { supplierId } = erpCatalogExportJobSchema.parse(data);
    const credentials = dependencies.blingCredentials;
    if (credentials === null) {
      logger.warn("erp.catalog_export_unconfigured", { supplierId });
      return EMPTY_TALLY.summary;
    }
    const client = supplierBlingClient(
      { ...dependencies, blingCredentials: credentials },
      supplierId,
    );
    const saveResult = async (result: ErpCatalogExportResult) =>
      saveErpCatalogExportResult(dependencies.database, {
        supplierId,
        provider: "bling",
        finishedAt: new Date(),
        result,
      });
    try {
      const tally = await exportCatalog(client, { dependencies, supplierId });
      await saveResult(doneResult(tally));
      logger.info("erp.catalog_exported", { supplierId, ...tally.summary });
      return tally.summary;
    } catch (error) {
      if (attempt.isLast) {
        await saveResult({ kind: "failed", reason: userMessageOr(error, FAILED_FALLBACK_REASON) });
      }
      throw error;
    }
  };
}
