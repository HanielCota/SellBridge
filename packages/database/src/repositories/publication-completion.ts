import type { ListingPauseReason } from "@sellbridge/shared/listing-pause-reasons";
import { notFoundError } from "@sellbridge/shared/errors";
import { eq, sql } from "drizzle-orm";
import type { Transaction } from "../client.ts";
import {
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { sellableBySupplier } from "./sql/sellable.ts";
import { targetMatchesStoreSupplier } from "./sql/store-supplier-match.ts";
import { shareLockProductSource } from "./lock-product-source.ts";

/**
 * Source/product locks serialize completion with archiving, blocking and deactivation. A store
 * the supplier closed does not keep a finished publication off: its stock just syncs at zero.
 * Returns why the publication must land paused, or null when it may go live.
 */
export async function publicationBlockedReason(
  transaction: Transaction,
  targetId: string,
): Promise<ListingPauseReason | null> {
  const [product] = await transaction
    .select({ id: listings.supplierProductId })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(eq(listingTargets.id, targetId));
  if (product === undefined) throw notFoundError("Publication not found.");
  await shareLockProductSource(transaction, product.id);
  const [row] = await transaction
    .select({
      sellable: sql<boolean>`${sellableBySupplier()}`.mapWith(Boolean),
      matchesStoreSupplier: sql<boolean>`${targetMatchesStoreSupplier()}`.mapWith(Boolean),
      storeConnected: sql<boolean>`${storeConnections.status} = 'connected'`.mapWith(Boolean),
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(eq(listingTargets.id, targetId))
    .for("share", { of: [supplierProducts] });
  if (row === undefined) throw notFoundError("Publication not found.");
  if (row.sellable && row.matchesStoreSupplier && row.storeConnected) return null;
  if (row.sellable && row.matchesStoreSupplier) return "store_disconnected";
  if (row.sellable) return "store_supplier_changed";
  return "supplier_unavailable";
}
