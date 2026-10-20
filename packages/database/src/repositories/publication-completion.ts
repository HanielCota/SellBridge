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
import { sellableOnMarketplace } from "./sql/sellable.ts";
import { targetMatchesStoreSupplier } from "./sql/store-supplier-match.ts";
import { shareLockProductSource } from "./lock-product-source.ts";

/** Source/product locks serialize completion with archiving, blocking and deactivation. */
export async function publicationMayGoLive(transaction: Transaction, targetId: string) {
  const [product] = await transaction
    .select({ id: listings.supplierProductId })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(eq(listingTargets.id, targetId));
  if (product === undefined) throw notFoundError("Publication not found.");
  await shareLockProductSource(transaction, product.id);
  const [row] = await transaction
    .select({
      mayPublish: sql<boolean>`(${sellableOnMarketplace()} and ${targetMatchesStoreSupplier()}
      and ${storeConnections.status} = 'connected')`.mapWith(Boolean),
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(eq(listingTargets.id, targetId))
    .for("share", { of: [supplierProducts] });
  if (row === undefined) throw notFoundError("Publication not found.");
  return row.mayPublish;
}
