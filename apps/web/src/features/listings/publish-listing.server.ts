import {
  createListingWithTargets,
  type CreatedListing,
  findConnectedStores,
  type NewListingInput,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { enqueuePublishJobs } from "@/lib/server/queues";

/** Deduplicates the chosen stores and fails unless every one is connected to the tenant. */
export async function assertConnectedStores(
  tenantId: string,
  storeConnectionIds: readonly string[],
): Promise<string[]> {
  const uniqueStoreIds = [...new Set(storeConnectionIds)];
  const stores = await findConnectedStores(database, tenantId, uniqueStoreIds);
  if (stores.length !== uniqueStoreIds.length) {
    throw validationError("Uma ou mais lojas escolhidas não estão conectadas");
  }
  return uniqueStoreIds;
}

async function enqueueTargets(tenantId: string, targetIds: readonly string[]): Promise<void> {
  await enqueuePublishJobs(targetIds.map((listingTargetId) => ({ tenantId, listingTargetId })));
}

/** Creates one listing for the given (already checked) stores and queues its publication. */
export async function publishListing(
  tenantId: string,
  draft: NewListingInput,
  storeIds: readonly string[],
): Promise<CreatedListing> {
  const created = await createListingWithTargets(database, tenantId, draft, storeIds);
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
  const targetIds: string[] = [];
  try {
    for (const draft of drafts) {
      const created = await createListingWithTargets(database, tenantId, draft, storeIds);
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
