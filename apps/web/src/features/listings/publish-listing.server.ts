import { billingRules } from "@/features/billing/billing-config.server";
import {
  assertBillingCapacity,
  assertStoresSellSupplier,
  createListingWithTargets,
  type CreatedListing,
  findConnectedStores,
  findStoresHeldByBuyerAddress,
  type NewListingInput,
} from "@sellbridge/database/repositories";
import { type FeeChannel, feeChannelOf } from "@sellbridge/shared/channel-fees";
import { withDeadline } from "@sellbridge/shared/deadline";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { enqueuePublishJobs } from "@/lib/server/queues";

export interface ConnectedStores {
  storeIds: string[];
  /** The fee channel of each store's marketplace, each once: the price must pay on all. */
  channels: FeeChannel[];
}

/** Deduplicates the chosen stores and fails unless every one is connected to the tenant. */
export async function assertConnectedStores(
  tenantId: string,
  storeConnectionIds: readonly string[],
): Promise<ConnectedStores> {
  const uniqueStoreIds = [...new Set(storeConnectionIds)];
  const stores = await findConnectedStores(database, tenantId, uniqueStoreIds);
  if (stores.length !== uniqueStoreIds.length) {
    throw validationError("Uma ou mais lojas escolhidas não estão conectadas");
  }
  await assertStoresBuyElsewhere(tenantId, uniqueStoreIds);
  return {
    storeIds: uniqueStoreIds,
    channels: [...new Set(stores.map((store) => feeChannelOf(store.marketplace)))],
  };
}

/**
 * New products wait while a store's account buys at its supplier's address: personal purchases
 * would keep reaching the supplier. Sales and existing listings go on.
 */
async function assertStoresBuyElsewhere(tenantId: string, storeIds: readonly string[]) {
  const [held] = await findStoresHeldByBuyerAddress(database, tenantId, storeIds);
  if (held === undefined) {
    return;
  }
  throw conflictError(
    `A loja ${held.shopName} compra no endereço do fornecedor. Troque o endereço de compra no Mercado Livre e clique em "Já arrumei, conferir de novo" em Lojas para voltar a publicar.`,
  );
}

/** Each store sells a single supplier: refuses a store that does not sell every one given. */
export async function assertStoresSellSuppliers(
  tenantId: string,
  storeIds: readonly string[],
  supplierIds: readonly string[],
): Promise<void> {
  for (const supplierId of new Set(supplierIds)) {
    await assertStoresSellSupplier(database, tenantId, storeIds, supplierId);
  }
}

const ENQUEUE_DEADLINE_MILLISECONDS = 3000;

/**
 * Queues pending targets for the worker. The targets are already saved as "pending", so if
 * Redis is unavailable the worker's recovery job queues them within minutes (see
 * apps/worker/src/processors/publish-recovery.ts): the reseller's action still succeeded.
 */
export async function enqueueTargets(
  tenantId: string,
  targetIds: readonly string[],
): Promise<void> {
  try {
    // ioredis keeps reconnecting for minutes while Redis is down; the button must not spin.
    await withDeadline(
      enqueuePublishJobs(targetIds.map((listingTargetId) => ({ tenantId, listingTargetId }))),
      ENQUEUE_DEADLINE_MILLISECONDS,
      "Fila de publicação",
    );
  } catch (error) {
    logger.error("listing.enqueue_failed", { tenantId, targets: targetIds.length, error });
  }
}

/** Creates one listing for the given (already checked) stores and queues its publication. */
export async function publishListing(
  tenantId: string,
  draft: NewListingInput,
  storeIds: readonly string[],
): Promise<CreatedListing> {
  const created = await createListingWithTargets(
    database,
    tenantId,
    { ...draft, billing: billingRules() },
    storeIds,
  );
  await enqueueTargets(tenantId, created.targetIds);
  logger.info("listing.created", {
    tenantId,
    listingId: created.listingId,
    targets: created.targetIds.length,
  });
  return created;
}

/** Creates many listings for the same (already checked) stores and queues them in one batch. */
export async function publishListings(
  tenantId: string,
  drafts: readonly NewListingInput[],
  storeIds: readonly string[],
): Promise<string[]> {
  // Each listing is its own transaction; checking the whole batch first keeps a batch that does
  // not fit the plan from publishing its first few and failing on the rest.
  const rules = billingRules();
  if (rules !== null) {
    // One plan slot per listing and destination store (item 16, N7).
    await assertBillingCapacity(database, {
      tenantId,
      rules,
      resource: "listings",
      requested: drafts.length * storeIds.length,
    });
  }
  const targetIds: string[] = [];
  try {
    for (const draft of drafts) {
      const created = await createListingWithTargets(
        database,
        tenantId,
        { ...draft, billing: billingRules() },
        storeIds,
      );
      targetIds.push(...created.targetIds);
    }
  } finally {
    // Listings created before a failure still get queued instead of staying pending forever.
    await enqueueTargets(tenantId, targetIds);
  }
  logger.info("listing.bulk_published", {
    tenantId,
    products: drafts.length,
    targets: targetIds.length,
  });
  return targetIds;
}
