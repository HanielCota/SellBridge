import { randomUUID } from "node:crypto";
import {
  createListingWithTargets,
  findConnectedStores,
  getCatalogProductForRegion,
  getTargetForPublishing,
  listListingOverview,
  listStoreConnections,
  resetListingErrorsForRetry,
  setListingsPaused,
  updateListingPrice,
} from "@sellbridge/database/repositories";
import {
  encodeMockOrderResource,
  MOCK_SIGNATURE_HEADER,
  signMockWebhook,
} from "@sellbridge/marketplaces";
import { validationError } from "@sellbridge/shared/errors";
import { percentOfCents } from "@sellbridge/shared/money";
import { logger } from "@sellbridge/shared/logger";
import { createListingSchema, listingsSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tenantMiddleware } from "@/lib/server/middleware";
import { enqueuePublishJobs } from "@/lib/server/queues";
import { requireTenantRegion } from "@/lib/server/region";
import { ESTIMATED_MARKETPLACE_FEE_BPS } from "./profit";

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
    const uniqueStoreIds = [...new Set(data.storeConnectionIds)];
    const stores = await findConnectedStores(database, context.tenantId, uniqueStoreIds);
    if (stores.length !== uniqueStoreIds.length) {
      throw validationError("Uma ou mais lojas escolhidas não estão conectadas");
    }
    const created = await createListingWithTargets(
      database,
      context.tenantId,
      {
        supplierProductId: product.id,
        title: data.title,
        description: data.description,
        priceCents: data.priceCents,
      },
      uniqueStoreIds,
    );
    await enqueuePublishJobs(
      created.targetIds.map((listingTargetId) => ({ tenantId: context.tenantId, listingTargetId })),
    );
    logger.info("listing.created", {
      tenantId: context.tenantId,
      listingId: created.listingId,
      targets: created.targetIds.length,
    });
    return created;
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
    const priceCents = row.listing.priceCents;
    const resource = encodeMockOrderResource({
      externalOrderId: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
      status: "paid",
      totalCents: priceCents,
      marketplaceFeeCents: percentOfCents(priceCents, ESTIMATED_MARKETPLACE_FEE_BPS),
      buyerName: "Comprador simulado",
      orderedAt: new Date().toISOString(),
      items: [
        {
          externalListingId: row.target.externalId,
          title: row.listing.title,
          quantity: 1,
          unitPriceCents: priceCents,
        },
      ],
    });
    const rawBody = JSON.stringify({
      id: randomUUID(),
      topic: "orders",
      shopId: row.store.externalShopId,
      resource,
    });
    const mockWebhookSecret = environment.MOCK_WEBHOOK_SECRET;
    if (mockWebhookSecret === undefined) {
      throw validationError("O marketplace simulado não está configurado (MOCK_WEBHOOK_SECRET)");
    }
    const response = await fetch(new URL("/api/webhooks/mock", environment.APP_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MOCK_SIGNATURE_HEADER]: signMockWebhook(rawBody, mockWebhookSecret),
      },
      body: rawBody,
    });
    if (!response.ok) {
      throw validationError("O marketplace simulado não conseguiu enviar a venda");
    }
    logger.info("listing.mock_sale_simulated", {
      tenantId: context.tenantId,
      listingTargetId: data.listingTargetId,
    });
    return { ok: true };
  });
