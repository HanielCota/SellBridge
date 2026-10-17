import {
  getPublishBatchStatus,
  getSellableProducts,
  listActiveSuppliers,
  listSellableCatalog,
  listSellableCategories,
  listStoreConnections,
} from "@sellbridge/database/repositories";
import { type BulkPublishSkip, planBulkPublish } from "@sellbridge/shared/bulk-publish-plan";
import { validationError } from "@sellbridge/shared/errors";
import { assertBatchKeepsMargin } from "@sellbridge/shared/fee-model";
import { estimatePublishProgress } from "@sellbridge/shared/publish-progress";
import {
  bulkPublishProgressSchema,
  bulkPublishSchema,
  listingPriceCentsSchema,
  priceForRule,
  sellableCatalogSearchSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import {
  assertConnectedStores,
  assertStoresSellSuppliers,
  publishListings,
} from "@/features/listings/publish-listing.server";
import { BULK_SKIP_REASONS } from "@/features/catalog/bulk-skip-reasons";
import { feeScheduleFrom } from "@/features/reports/fee-schedule";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tenantMiddleware } from "@/lib/server/middleware";

/** One list with every product the tenant can sell, plus what the filters and publishing need. */
export const getSellableCatalog = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(sellableCatalogSearchSchema)
  .handler(async ({ context, data }) => {
    const [products, categories, suppliers, stores] = await Promise.all([
      listSellableCatalog(
        database,
        context.tenantId,
        {
          search: data.query,
          categorySlug: data.category,
          supplierId: data.supplier,
          inStockOnly: data.inStock,
          unpublishedOnly: data.unpublished,
          sort: data.sort,
        },
        { page: data.page, pageSize: data.pageSize },
      ),
      listSellableCategories(database),
      listActiveSuppliers(database, {}),
      listStoreConnections(database, context.tenantId),
    ]);
    return {
      products,
      categories,
      suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
      stores: stores
        .filter((store) => store.status === "connected")
        .map((store) => ({
          id: store.id,
          shopName: store.shopName,
          marketplace: store.marketplace,
          supplierId: store.supplierId,
        })),
    };
  });

/** Nothing in the batch can go out: the reseller reads why, product by product. */
function nothingToPublish(skipped: readonly BulkPublishSkip[]): never {
  const named = skipped
    .slice(0, 3)
    .map((skip) => `"${skip.title ?? "produto"}" (${BULK_SKIP_REASONS[skip.reason]})`)
    .join(", ");
  throw validationError(`Nenhum produto pode ser publicado: ${named}.`);
}

/**
 * Publishes many catalog products at once with one price rule, by the rules of publishing one
 * at a time (title, description, stock). Products that cannot go out are skipped and named
 * with the reason, so running it twice does not duplicate listings and nothing is hidden.
 */
export const publishProductsInBulk = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(bulkPublishSchema)
  .handler(async ({ context, data }) => {
    const storeIds = await assertConnectedStores(context.tenantId, data.storeConnectionIds);
    const products = await getSellableProducts(database, context.tenantId, [
      ...new Set(data.productIds),
    ]);
    await assertStoresSellSuppliers(
      context.tenantId,
      storeIds,
      products.map((product) => product.supplierId),
    );
    const plan = planBulkPublish({
      requestedIds: data.productIds,
      products,
      safetyUnits: environment.STOCK_SAFETY_UNITS,
    });
    if (plan.drafts.length === 0) {
      nothingToPublish(plan.skipped);
    }
    const productsById = new Map(products.map((product) => [product.id, product]));
    const drafts = plan.drafts.flatMap((draft) => {
      const product = productsById.get(draft.supplierProductId);
      if (product === undefined) {
        return [];
      }
      const rule = data.priceOverrides?.[product.id] ?? data.priceRule;
      return [{ ...draft, priceCents: priceForRule(product, rule) }];
    });
    // Checked before anything is written, so one product priced out of range cannot leave
    // the batch half published.
    const outOfRange = drafts.find(
      (draft) => !listingPriceCentsSchema.safeParse(draft.priceCents).success,
    );
    if (outOfRange) {
      throw validationError(
        `O preço de "${outOfRange.title}" ficaria acima de R$ 1.000.000,00. Ajuste a regra de preço.`,
      );
    }
    // Same floor as one listing at a time: no product of the batch may lose money after fees.
    assertBatchKeepsMargin(
      drafts.flatMap((draft) => {
        const product = productsById.get(draft.supplierProductId);
        return product === undefined ? [] : [{ ...draft, costCents: product.costCents }];
      }),
      feeScheduleFrom(environment),
    );
    const targetIds = await publishListings(context.tenantId, drafts, storeIds);
    return { published: drafts.length, skipped: plan.skipped, targetIds };
  });

/** Where the marketplace jobs of a bulk publication stand, with the time left (item 14.b). */
export const getBulkPublishProgress = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(bulkPublishProgressSchema)
  .handler(async ({ context, data }) => {
    const status = await getPublishBatchStatus(database, context.tenantId, data.targetIds);
    const progress = estimatePublishProgress({
      total: status.total,
      finished: status.published + status.failed,
      startedAt: status.startedAt,
      lastFinishedAt: status.lastFinishedAt,
    });
    return {
      published: status.published,
      failed: status.failed,
      pending: status.pending,
      progress,
    };
  });
