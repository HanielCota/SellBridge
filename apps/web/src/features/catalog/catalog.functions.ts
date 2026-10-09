import {
  createListingWithTargets,
  findConnectedStores,
  getRegionProducts,
  listRegionCatalog,
  listRegionCategories,
  listStoreConnections,
  listSuppliersForRegion,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  bulkPublishSchema,
  priceForRule,
  regionCatalogSearchSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { enqueuePublishJobs } from "@/lib/server/queues";
import { requireTenantRegion } from "@/lib/server/region";

/** One list with every product the tenant can sell, plus what the filters and publishing need. */
export const getRegionCatalog = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(regionCatalogSearchSchema)
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const [products, categories, suppliers, stores] = await Promise.all([
      listRegionCatalog(
        database,
        { region, tenantId: context.tenantId },
        {
          search: data.query,
          categorySlug: data.category,
          supplierId: data.supplier,
          inStockOnly: data.inStock,
          sort: data.sort,
        },
        { page: data.page, pageSize: data.pageSize },
      ),
      listRegionCategories(database, region),
      listSuppliersForRegion(database, region, {}),
      listStoreConnections(database, context.tenantId),
    ]);
    return {
      region,
      products,
      categories,
      suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
      stores: stores
        .filter((store) => store.status === "connected")
        .map((store) => ({
          id: store.id,
          shopName: store.shopName,
          marketplace: store.marketplace,
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
    const region = await requireTenantRegion(context.tenantId);
    const storeIds = [...new Set(data.storeConnectionIds)];
    const stores = await findConnectedStores(database, context.tenantId, storeIds);
    if (stores.length !== storeIds.length) {
      throw validationError("Uma ou mais lojas escolhidas não estão conectadas");
    }
    const products = await getRegionProducts(database, { region, tenantId: context.tenantId }, [
      ...new Set(data.productIds),
    ]);
    const toPublish = products.filter((product) => !product.published);
    const targetIds: string[] = [];
    for (const product of toPublish) {
      const created = await createListingWithTargets(
        database,
        context.tenantId,
        {
          supplierProductId: product.id,
          title: product.title,
          description: product.description,
          priceCents: priceForRule(product, data.priceRule),
        },
        storeIds,
      );
      targetIds.push(...created.targetIds);
    }
    await enqueuePublishJobs(
      targetIds.map((listingTargetId) => ({ tenantId: context.tenantId, listingTargetId })),
    );
    logger.info("listing.bulk_published", {
      tenantId: context.tenantId,
      products: toPublish.length,
      targets: targetIds.length,
    });
    return {
      published: toPublish.length,
      skipped: data.productIds.length - toPublish.length,
    };
  });
