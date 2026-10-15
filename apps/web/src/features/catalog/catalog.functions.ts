import {
  getSellableProducts,
  listActiveSuppliers,
  listSellableCatalog,
  listSellableCategories,
  listStoreConnections,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { assertBatchKeepsMargin } from "@sellbridge/shared/fee-model";
import {
  bulkPublishSchema,
  fitListingTitle,
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

/**
 * Publishes many catalog products at once with one price rule. Products already listed by
 * the tenant are skipped, so running it twice does not duplicate listings.
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
    const toPublish = products.filter((product) => !product.published);
    const drafts = toPublish.map((product) => ({
      supplierProductId: product.id,
      title: fitListingTitle(product.title),
      description: product.description,
      priceCents: priceForRule(product, data.priceOverrides?.[product.id] ?? data.priceRule),
    }));
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
    const toPublishById = new Map(toPublish.map((product) => [product.id, product]));
    assertBatchKeepsMargin(
      drafts.flatMap((draft) => {
        const product = toPublishById.get(draft.supplierProductId);
        return product === undefined ? [] : [{ ...draft, costCents: product.costCents }];
      }),
      feeScheduleFrom(environment),
    );
    await publishListings(context.tenantId, drafts, storeIds);
    return {
      published: toPublish.length,
      skipped: new Set(data.productIds).size - toPublish.length,
    };
  });
