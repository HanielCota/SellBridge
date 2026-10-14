import {
  getRegionProducts,
  listRegionCatalog,
  listRegionCategories,
  listStoreConnections,
  listSuppliersForRegion,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import {
  bulkPublishSchema,
  fitListingTitle,
  listingPriceCentsSchema,
  priceForRule,
  regionCatalogSearchSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { assertConnectedStores, publishListings } from "@/features/listings/publish-listing.server";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { requireTenantRegion } from "@/features/region/region.server";

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
          unpublishedOnly: data.unpublished,
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
    const storeIds = await assertConnectedStores(context.tenantId, data.storeConnectionIds);
    const products = await getRegionProducts(database, { region, tenantId: context.tenantId }, [
      ...new Set(data.productIds),
    ]);
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
    await publishListings(context.tenantId, drafts, storeIds);
    return {
      published: toPublish.length,
      skipped: new Set(data.productIds).size - toPublish.length,
    };
  });
