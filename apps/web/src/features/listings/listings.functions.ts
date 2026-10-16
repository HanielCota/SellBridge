import { billingConfigured } from "@/features/billing/stripe.server";
import {
  getSellableCatalogProduct,
  getTargetForPublishing,
  listListingOverview,
  listStoreConnections,
  resetListingErrorsForRetry,
  storesListingProduct,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
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
import { tenantMiddleware } from "@/lib/server/middleware";
import {
  buildMockOrderWebhook,
  requireMockWebhookSecret,
  sendMockWebhook,
} from "@/features/listings/mock-sale.server";
import {
  createListingForTenant,
  setListingsPausedForTenant,
  updateListingPriceForTenant,
} from "./listing-commands.server";
import { enqueueTargets } from "./publish-listing.server";

export const getNewListingData = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ productId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const [product, stores, listedOn] = await Promise.all([
      getSellableCatalogProduct(database, data.productId),
      listStoreConnections(database, context.tenantId),
      storesListingProduct(database, context.tenantId, data.productId),
    ]);
    // One listing per product and store: a store that already sells it is shown, not offered.
    const listedIds = new Set(listedOn.map((store) => store.storeId));
    const connected = stores.filter((store) => store.status === "connected");
    // Each store sells a single supplier: only the ones selling this product's supplier qualify.
    return {
      product,
      stores: connected
        .filter((store) => store.supplierId === product.supplierId)
        .map((store) => ({ ...store, listed: listedIds.has(store.id) })),
      hasOtherStores: connected.some((store) => store.supplierId !== product.supplierId),
    };
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

/**
 * Simulated marketplace only: produces a signed "orders" webhook for a published listing
 * and sends it to our own endpoint, exercising the real webhook → queue → worker path.
 */
export const simulateMockSale = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ listingTargetId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const row = await getTargetForPublishing(database, context.tenantId, data.listingTargetId);
    if (row.store.marketplace !== "mock") {
      throw validationError("Só é possível simular vendas em lojas simuladas");
    }
    if (row.target.status !== "published" || !row.target.externalId) {
      throw validationError("O anúncio precisa estar publicado para simular uma venda");
    }
    const mockWebhookSecret = requireMockWebhookSecret();
    const rawBody = buildMockOrderWebhook({
      externalShopId: row.store.externalShopId,
      externalListingId: row.target.externalId,
      title: row.listing.title,
      priceCents: row.listing.priceCents,
    });
    await sendMockWebhook(rawBody, mockWebhookSecret);
    logger.info("listing.mock_sale_simulated", {
      tenantId: context.tenantId,
      listingTargetId: data.listingTargetId,
    });
    return { ok: true };
  });
