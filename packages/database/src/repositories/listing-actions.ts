import { assertPriceKeepsMargin, type FeeSchedule } from "@sellbridge/shared/fee-model";
import {
  unavailableListingMessage,
  unavailableReason,
} from "@sellbridge/shared/catalog-availability";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { pauseTransition, RETRYABLE_TARGET_STATUS } from "@sellbridge/shared/listing-rules";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { listings, listingTargets, supplierProducts, suppliers } from "../schema/index.ts";
import { assertBillingCapacity } from "./billing.ts";
import { availabilityColumns } from "./listing-overview.ts";
import { targetMatchesStoreSupplier } from "./sql/store-supplier-match.ts";

/** What the reseller does to listings from the list: pause, resume, reprice, retry. */

async function requireTenantListings(
  database: Database,
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
  const rows = await executor
    .select({ listingId: listings.id, ...availabilityColumns })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(inArray(listings.id, [...ids]))
    .for("share", { of: [supplierProducts, suppliers] });
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
  database: Database,
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
      .set({ status: transition.to })
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
}

/** Changes the sale price; the sync job sends it to every store where the listing is live. */
export async function updateListingPrice(
  database: Database,
  tenantId: string,
  change: ListingPriceChange,
): Promise<void> {
  const { listingId, priceCents } = change;
  const [row] = await database
    .select({ costCents: supplierProducts.costCents })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId)));
  if (!row) {
    throw notFoundError("Publicação não encontrada");
  }
  assertPriceKeepsMargin(priceCents, { costCents: row.costCents }, change.feeSchedule);
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
  options: { billingEnabled: boolean; planMatrix?: boolean },
): Promise<string[]> {
  await requireTenantListings(database, tenantId, listingIds);
  const failedTargets = and(
    eq(listingTargets.tenantId, tenantId),
    inArray(listingTargets.listingId, [...listingIds]),
    eq(listingTargets.status, RETRYABLE_TARGET_STATUS),
  );
  return database.transaction(async (transaction) => {
    if (options.billingEnabled) {
      const [failed] = await transaction
        .select({ value: count() })
        .from(listingTargets)
        .where(failedTargets);
      await assertBillingCapacity(transaction, tenantId, {
        resource: "listings",
        requested: failed?.value ?? 0,
        planMatrix: options.planMatrix,
      });
    }
    const reset = await transaction
      .update(listingTargets)
      .set({ status: "pending", errorReason: null })
      .where(failedTargets)
      .returning({ id: listingTargets.id });
    return reset.map((row) => row.id);
  });
}
