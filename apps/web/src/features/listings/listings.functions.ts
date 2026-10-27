import { billingConfigured } from "@/features/billing/stripe.server";
import {
  requestDescriptionResend,
  getSellableCatalogProduct,
  listListingOverview,
  listStoreConnections,
  resetListingErrorsForRetry,
  storesListingProduct,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  createListingSchema,
  listingPriceCentsSchema,
  listingsSearchSchema,
  MAX_LISTING_BATCH,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";
import { tenantMiddleware } from "@/lib/server/middleware";
import {
  createListingForTenant,
  setListingsPausedForTenant,
  updateListingPriceForTenant,
} from "./listing-commands.server";
import { chooseNewListingStores } from "./new-listing-stores";
import { enqueueTargets } from "./publish-listing.server";

export const getNewListingData = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ productId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const [product, stores, listedOn] = await Promise.all([
      getSellableCatalogProduct(database, data.productId, context.tenantId),
      listStoreConnections(database, context.tenantId),
      storesListingProduct(database, context.tenantId, data.productId),
    ]);
    // One listing per product and store: a store that already sells it is shown, not offered.
    const listedIds = new Set(listedOn.map((store) => store.storeId));
    return { product, ...chooseNewListingStores(product, stores, listedIds) };
  });

export const createListing = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(createListingSchema)
  .handler(async ({ context, data }) =>
    createListingForTenant(context.tenantId, {
      productId: data.supplierProductId,
      title: data.title,
      description: data.description,
      priceCents: data.priceCents,
      storeConnectionIds: data.storeConnectionIds,
    }),
  );

export const listListings = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(listingsSearchSchema)
  .handler(async ({ context, data }) =>
    listListingOverview(
      database,
      context.tenantId,
      { status: data.status, search: data.query, sort: data.sort },
      { page: data.page, pageSize: data.pageSize },
    ),
  );

const listingIdsSchema = z.object({
  listingIds: z.array(z.uuid()).min(1).max(MAX_LISTING_BATCH),
});

/** Puts every failed store of the chosen listings back in the publishing queue. */
export const retryListings = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(listingIdsSchema)
  .handler(async ({ context, data }) => {
    const targetIds = await resetListingErrorsForRetry(
      database,
      context.tenantId,
      data.listingIds,
      {
        billingEnabled: billingConfigured(),
      },
    );
    await enqueueTargets(context.tenantId, targetIds);
    logger.info("listing.retry_requested", {
      tenantId: context.tenantId,
      targets: targetIds.length,
    });
    return { retried: targetIds.length };
  });

/**
 * "Reenviar descrição": the chosen listings whose description the marketplace refused go back to
 * the automatic resends, and the sync runs now instead of in up to 15 minutes (13.b).
 */
export const resendDescriptions = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(listingIdsSchema)
  .handler(async ({ context, data }) => {
    const resent = await requestDescriptionResend(database, context.tenantId, data.listingIds);
    if (resent > 0) {
      await requestStockSync("listing.description_resend_deferred");
    }
    logger.info("listing.description_resend_requested", { tenantId: context.tenantId, resent });
    return { resent };
  });

/** Pauses (zero stock on the marketplace) or resumes the chosen listings. */
export const setListingsPausedFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(listingIdsSchema.extend({ paused: z.boolean() }))
  .handler(async ({ context, data }) => ({
    changed: await setListingsPausedForTenant(context.tenantId, data.listingIds, data.paused),
  }));

/** The repository rejects a price at or below cost, the same rule `createListing` applies. */
export const updateListingPriceFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ listingId: z.uuid(), priceCents: listingPriceCentsSchema }))
  .handler(async ({ context, data }) => {
    await updateListingPriceForTenant(context.tenantId, data.listingId, data.priceCents);
    return { ok: true };
  });
