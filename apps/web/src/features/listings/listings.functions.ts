import { randomUUID } from "node:crypto";
import {
  createListingWithTargets,
  findConnectedStores,
  getCatalogProductForRegion,
  getTargetForPublishing,
  listListingTargets,
  listStoreConnections,
  resetTargetForRetry,
} from "@sellbridge/database/repositories";
import {
  encodeMockOrderResource,
  MOCK_SIGNATURE_HEADER,
  signMockWebhook,
} from "@sellbridge/marketplaces";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { createListingSchema, listingsSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tenantMiddleware } from "@/lib/server/middleware";
import { enqueuePublishJobs } from "@/lib/server/queues";
import { requireTenantRegion } from "@/lib/server/region";

export const getNewListingData = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(z.object({ productId: z.uuid() }))
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
  .inputValidator(createListingSchema)
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
  .inputValidator(listingsSearchSchema)
  .handler(async ({ context, data }) => {
    return listListingTargets(
      database,
      context.tenantId,
      { status: data.status, search: data.query },
      { page: data.page, pageSize: data.pageSize },
    );
  });

export const retryListingTarget = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .inputValidator(z.object({ listingTargetId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await resetTargetForRetry(database, context.tenantId, data.listingTargetId);
    await enqueuePublishJobs([
      { tenantId: context.tenantId, listingTargetId: data.listingTargetId },
    ]);
    logger.info("listing.retry_requested", {
      tenantId: context.tenantId,
      listingTargetId: data.listingTargetId,
    });
    return { ok: true };
  });

/**
 * Simulated marketplace only: produces a signed "orders" webhook for a published listing
 * and sends it to our own endpoint, exercising the real webhook → queue → worker path.
 */
export const simulateMockSale = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .inputValidator(z.object({ listingTargetId: z.uuid() }))
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
      marketplaceFeeCents: Math.round((priceCents * 1400) / 10_000),
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
    const response = await fetch(new URL("/api/webhooks/mock", environment.APP_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MOCK_SIGNATURE_HEADER]: signMockWebhook(rawBody, environment.MOCK_WEBHOOK_SECRET),
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
