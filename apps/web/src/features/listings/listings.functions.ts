import {
  createListingWithTargets,
  findConnectedStores,
  getCatalogProductForRegion,
  listListingTargets,
  listStoreConnections,
  resetTargetForRetry,
} from "@sellbridge/db/repositories";
import { ValidationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { createListingSchema, listingsSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { tenantMiddleware } from "@/lib/server/middleware";
import { enqueuePublishJobs } from "@/lib/server/queues";
import { requireTenantRegion } from "@/lib/server/region";

export const getNewListingData = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(z.object({ productId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const [product, stores] = await Promise.all([
      getCatalogProductForRegion(db, region, data.productId),
      listStoreConnections(db, context.tenantId),
    ]);
    return { product, stores: stores.filter((store) => store.status === "connected") };
  });

export const createListing = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .inputValidator(createListingSchema)
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const product = await getCatalogProductForRegion(db, region, data.supplierProductId);
    if (data.priceCents <= product.costCents) {
      throw new ValidationError("O preço de venda precisa ser maior que o custo do fornecedor");
    }
    const uniqueStoreIds = [...new Set(data.storeConnectionIds)];
    const stores = await findConnectedStores(db, context.tenantId, uniqueStoreIds);
    if (stores.length !== uniqueStoreIds.length) {
      throw new ValidationError("Uma ou mais lojas escolhidas não estão conectadas");
    }
    const created = await createListingWithTargets(
      db,
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
      db,
      context.tenantId,
      { status: data.status, search: data.q },
      { page: data.page, pageSize: data.pageSize },
    );
  });

export const retryListingTarget = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .inputValidator(z.object({ listingTargetId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await resetTargetForRetry(db, context.tenantId, data.listingTargetId);
    await enqueuePublishJobs([
      { tenantId: context.tenantId, listingTargetId: data.listingTargetId },
    ]);
    logger.info("listing.retry_requested", {
      tenantId: context.tenantId,
      listingTargetId: data.listingTargetId,
    });
    return { ok: true };
  });
