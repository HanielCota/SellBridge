import {
  getCatalogProductForRegion,
  getTargetForPublishing,
  listListingOverview,
  listStoreConnections,
  resetListingErrorsForRetry,
  setListingsPaused,
  updateListingPrice,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { createListingSchema, listingsSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import {
  buildMockOrderWebhook,
  requireMockWebhookSecret,
  sendMockWebhook,
} from "@/features/listings/mock-sale.server";
import { enqueuePublishJobs } from "@/lib/server/queues";
import { requireTenantRegion } from "@/features/region/region.server";
import { assertConnectedStores, publishListing } from "./publish-listing.server";

export const getNewListingData = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ productId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const [product, stores] = await Promise.all([
      getCatalogProductForRegion(database, region, data.productId),
      listStoreConnections(database, context.tenantId),
    ]);
    return { product, stores: stores.filter((store) => store.status === "connected") };
  });

export const createListing = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(createListingSchema)
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const product = await getCatalogProductForRegion(database, region, data.supplierProductId);
    if (data.priceCents <= product.costCents) {
      throw validationError("O preço de venda precisa ser maior que o custo do fornecedor");
    }
    const storeIds = await assertConnectedStores(context.tenantId, data.storeConnectionIds);
    return publishListing(
      context.tenantId,
      {
        supplierProductId: product.id,
        title: data.title,
        description: data.description,
        priceCents: data.priceCents,
      },
      storeIds,
    );
  });

export const listListings = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(listingsSearchSchema)
  .handler(async ({ context, data }) =>
    listListingOverview(
      database,
      context.tenantId,
      { status: data.status, search: data.query },
      { page: data.page, pageSize: data.pageSize },
    ),
  );

const listingIdsSchema = z.object({ listingIds: z.array(z.uuid()).min(1).max(100) });

/** Puts every failed store of the chosen listings back in the publishing queue. */
export const retryListings = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(listingIdsSchema)
  .handler(async ({ context, data }) => {
    const targetIds = await resetListingErrorsForRetry(database, context.tenantId, data.listingIds);
    await enqueuePublishJobs(
      targetIds.map((listingTargetId) => ({ tenantId: context.tenantId, listingTargetId })),
    );
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
  .handler(async ({ context, data }) => {
    const changed = await setListingsPaused(
      database,
      context.tenantId,
      data.listingIds,
      data.paused,
    );
    logger.info(data.paused ? "listing.paused" : "listing.resumed", {
      tenantId: context.tenantId,
      targets: changed,
    });
    return { changed };
  });

export const updateListingPriceFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ listingId: z.uuid(), priceCents: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    await updateListingPrice(database, context.tenantId, data.listingId, data.priceCents);
    logger.info("listing.price_updated", { tenantId: context.tenantId, listingId: data.listingId });
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
