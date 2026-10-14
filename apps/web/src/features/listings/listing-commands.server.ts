import {
  type CreatedListing,
  getCatalogProductForRegion,
  setListingsPaused,
  updateListingPrice,
} from "@sellbridge/database/repositories";
import { assertSellablePrice } from "@sellbridge/shared/listing-rules";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";
import { requireTenantRegion } from "@/features/region/region.server";
import { type DraftOverrides, resolveListingDraft } from "./listing-draft";
import { assertConnectedStores, publishListing } from "./publish-listing.server";

/**
 * The listing write rules, in one place for every entry point (the app's server functions
 * and the public API), so a rule added here can never apply to one and not the other.
 */

export interface CreateListingCommand extends DraftOverrides {
  productId: string;
  storeConnectionIds: readonly string[];
}

/**
 * Sells a catalog product of the tenant's region on its connected stores: checks the price
 * against the cost, creates the listing and queues one publication per store.
 */
export async function createListingForTenant(
  tenantId: string,
  command: CreateListingCommand,
): Promise<CreatedListing> {
  const region = await requireTenantRegion(tenantId);
  const product = await getCatalogProductForRegion(database, region, command.productId);
  const draft = resolveListingDraft(product, command);
  assertSellablePrice(draft.priceCents, product.costCents);
  const storeIds = await assertConnectedStores(tenantId, command.storeConnectionIds);
  return publishListing(tenantId, draft, storeIds);
}

/** The repository rejects a price at or below cost, the same rule creation applies. */
export async function updateListingPriceForTenant(
  tenantId: string,
  listingId: string,
  priceCents: number,
): Promise<void> {
  await updateListingPrice(database, tenantId, listingId, priceCents);
  logger.info("listing.price_updated", { tenantId, listingId });
  // The marketplaces get the new price now, as the screen promises, not at the next scheduled run.
  await requestStockSync("listing.sync_deferred");
}

/** Pauses (zero stock on the marketplace) or resumes listings; returns the stores changed. */
export async function setListingsPausedForTenant(
  tenantId: string,
  listingIds: readonly string[],
  paused: boolean,
): Promise<number> {
  const changed = await setListingsPaused(database, tenantId, listingIds, paused);
  logger.info(paused ? "listing.paused" : "listing.resumed", { tenantId, targets: changed });
  // A paused listing must show zero stock right away, or sales keep coming in for up to 15 min.
  if (changed > 0) {
    await requestStockSync("listing.sync_deferred");
  }
  return changed;
}
