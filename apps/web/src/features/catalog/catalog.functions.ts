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
  LISTING_MAX_PRICE_CENTS,
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

/** The same ceiling as a single listing: a markup on an expensive product must not slip past it. */
function assertWithinListingCeiling(listings: readonly { title: string; priceCents: number }[]) {
  const overpriced = listings.filter((listing) => listing.priceCents > LISTING_MAX_PRICE_CENTS);
  if (overpriced.length === 0) return;
  throw validationError(
    "O preço de venda pode ser de até R$ 1.000.000,00. Diminua a margem destes produtos.",
    overpriced.map((listing) => listing.title),
  );
}

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
    const listings = toPublish.map((product) => ({
      supplierProductId: product.id,
      title: fitListingTitle(product.title),
      description: product.description,
      priceCents: priceForRule(product, data.priceOverrides?.[product.id] ?? data.priceRule),
    }));
    assertWithinListingCeiling(listings);
    await publishListings(context.tenantId, listings, storeIds);
    return {
      published: toPublish.length,
      skipped: data.productIds.length - toPublish.length,
    };
  });
