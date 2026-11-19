import { feeChannelOf } from "@sellbridge/shared/channel-fees";
import {
  assertPriceKeepsMargin,
  type FeeSchedule,
  type MercadoLivreStoreRates,
} from "@sellbridge/shared/fee-model";
import {
  unavailableListingMessage,
  unavailableReason,
} from "@sellbridge/shared/catalog-availability";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import type { ListingPauseReason } from "@sellbridge/shared/listing-pause-reasons";
import { pauseTransition, RETRYABLE_TARGET_STATUS } from "@sellbridge/shared/listing-rules";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { assertBillingCapacity } from "./billing.ts";
import { availabilityColumns } from "./listing-overview.ts";
import { productWeightGrams } from "./sql/product-weight.ts";
import { targetMatchesStoreSupplier } from "./sql/store-supplier-match.ts";
import { shareLockListingSources } from "./lock-product-source.ts";

const SELLER: ListingPauseReason = "seller";

/** What the reseller does to listings from the list: pause, resume, reprice, retry. */

async function requireTenantListings(
  database: DatabaseExecutor,
  tenantId: string,
  listingIds: readonly string[],
): Promise<void> {
  const [row] = await database
    .select({ total: count() })
    .from(listings)
    .where(and(eq(listings.tenantId, tenantId), inArray(listings.id, [...listingIds])));
  if ((row?.total ?? 0) !== new Set(listingIds).size) {
    throw notFoundError("Publicação não encontrada");
  }
}

/**
 * Listings among `ids` the supplier keeps off the marketplaces, with the reason. Their product
 * and supplier rows stay share-locked until the caller's transaction ends, so an admin turning
 * them off waits for a resume in progress (and then pauses it) or the resume sees them off.
 */
async function unavailableAmong(executor: DatabaseExecutor, ids: readonly string[]) {
  await shareLockListingSources(executor, ids);
  const rows = await executor
    .select({ listingId: listings.id, ...availabilityColumns })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(inArray(listings.id, [...ids]))
    .for("share", { of: [supplierProducts] });
  return rows.flatMap(({ listingId, ...availability }) => {
    const reason = unavailableReason(availability);
    return reason === null ? [] : [{ listingId, reason }];
  });
}

/**
 * Pauses or resumes the listings in every store where they are live. Paused listings
 * are kept at zero stock on the marketplace by the sync job. Resuming skips products the
 * supplier keeps off, and refuses when every listing asked is one of them. Returns the
 * targets changed.
 */
export async function setListingsPaused(
  database: DatabaseExecutor,
  tenantId: string,
  listingIds: readonly string[],
  paused: boolean,
): Promise<number> {
  await requireTenantListings(database, tenantId, listingIds);
  return await database.transaction(async (transaction) => {
    const blocked = paused ? [] : await unavailableAmong(transaction, listingIds);
    const [firstBlocked] = blocked;
    if (firstBlocked && blocked.length === new Set(listingIds).size) {
      throw conflictError(unavailableListingMessage(firstBlocked.reason));
    }
    const blockedIds = new Set(blocked.map((row) => row.listingId));
    const transition = pauseTransition(paused);
    const changed = await transaction
      .update(listingTargets)
      .set({ status: transition.to, pauseRequested: paused, pauseReason: paused ? SELLER : null })
      .where(
        and(
          eq(listingTargets.tenantId, tenantId),
          inArray(
            listingTargets.listingId,
            listingIds.filter((id) => !blockedIds.has(id)),
          ),
          eq(listingTargets.status, transition.from),
          // A shop moved to another supplier keeps those listings paused.
          paused ? undefined : targetMatchesStoreSupplier(),
        ),
      )
      .returning({ id: listingTargets.id });
    return changed.length;
  });
}

export interface ListingPriceChange {
  listingId: string;
  priceCents: number;
  /** The fees the price must cover, with the minimum margin (fee-model.ts). */
  feeSchedule: FeeSchedule;
  /** Mercado Livre's own numbers on the listing's stores, when they could be read. */
  mercadoLivreRates?: MercadoLivreStoreRates | null;
}

/** The product a listing sells and the stores it sells on; null when it is not the tenant's. */
export async function findListingPricingScope(
  database: Database,
  tenantId: string,
  listingId: string,
): Promise<{ productId: string; storeIds: string[] } | null> {
  const rows = await database
    .select({
      productId: listings.supplierProductId,
      storeId: listingTargets.storeConnectionId,
    })
    .from(listings)
    .leftJoin(
      listingTargets,
      and(eq(listingTargets.listingId, listings.id), eq(listingTargets.tenantId, tenantId)),
    )
    .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId)));
  const [first] = rows;
  if (first === undefined) {
    return null;
  }
  const storeIds = rows.flatMap((row) => (row.storeId === null ? [] : [row.storeId]));
  return { productId: first.productId, storeIds: [...new Set(storeIds)] };
}

/** The marketplaces the listing sells on, by its stores. */
async function listingMarketplaces(
  database: Database,
  tenantId: string,
  listingId: string,
): Promise<string[]> {
  const rows = await database
    .selectDistinct({ marketplace: storeConnections.marketplace })
    .from(listingTargets)
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(and(eq(listingTargets.tenantId, tenantId), eq(listingTargets.listingId, listingId)));
  return rows.map((row) => row.marketplace);
}

/**
 * Changes the sale price; the sync job sends it to every store where the listing is live. The
 * price must pay the fees of every marketplace the listing sells on.
 */
export async function updateListingPrice(
  database: Database,
  tenantId: string,
  change: ListingPriceChange,
): Promise<void> {
  const { listingId, priceCents } = change;
  const [[row], marketplaces] = await Promise.all([
    database
      .select({ costCents: supplierProducts.costCents, weightGrams: productWeightGrams })
      .from(listings)
      .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
      .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId))),
    listingMarketplaces(database, tenantId, listingId),
  ]);
  if (row === undefined) {
    throw notFoundError("Publicação não encontrada");
  }
  const channels = marketplaces.map(feeChannelOf);
  assertPriceKeepsMargin(
    priceCents,
    { ...row, mercadoLivreRates: change.mercadoLivreRates ?? null },
    change.feeSchedule,
    channels.length === 0 ? [change.feeSchedule.channel] : channels,
  );
  await database
    .update(listings)
    .set({ priceCents })
    .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId)));
}

/**
 * Puts every failed store of the given listings back in the queue; returns their ids. A failed
 * publication holds no plan slot, so the retry asks for them first (item 16 review).
 */
export async function resetListingErrorsForRetry(
  database: Database,
  tenantId: string,
  listingIds: readonly string[],
  options: { billingEnabled: boolean },
): Promise<string[]> {
  await requireTenantListings(database, tenantId, listingIds);
  return database.transaction(async (transaction) => {
    const blocked = await unavailableAmong(transaction, listingIds);
    const blockedIds = new Set(blocked.map((row) => row.listingId));
    const allowedIds = listingIds.filter((id) => !blockedIds.has(id));
    if (allowedIds.length === 0 && blocked[0] !== undefined) {
      throw conflictError(unavailableListingMessage(blocked[0].reason));
    }
    const failedTargets = and(
      eq(listingTargets.tenantId, tenantId),
      inArray(listingTargets.listingId, allowedIds),
      eq(listingTargets.status, RETRYABLE_TARGET_STATUS),
      targetMatchesStoreSupplier(),
    );
    if (options.billingEnabled) {
      const [failed] = await transaction
        .select({ value: count() })
        .from(listingTargets)
        .where(failedTargets);
      await assertBillingCapacity(transaction, tenantId, "listings", failed?.value ?? 0);
    }
    const reset = await transaction
      .update(listingTargets)
      .set({ status: "pending", errorReason: null, pauseRequested: false })
      .where(failedTargets)
      .returning({ id: listingTargets.id });
    return reset.map((row) => row.id);
  });
}
