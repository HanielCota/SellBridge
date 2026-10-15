import { sql, type SQL } from "drizzle-orm";
import {
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
} from "../../schema/index.ts";

/**
 * The listing target in the query sells, through its shop, a product of the shop's supplier, or
 * the shop has no supplier yet (shops connected before the rule keep selling what they had).
 * Needs `listing_targets` in the FROM clause.
 */
export function targetMatchesStoreSupplier(): SQL {
  return sql`exists (select 1 from ${storeConnections}
    inner join ${listings} on ${listings.id} = ${listingTargets.listingId}
    inner join ${supplierProducts} on ${supplierProducts.id} = ${listings.supplierProductId}
    where ${storeConnections.id} = ${listingTargets.storeConnectionId}
      and (${storeConnections.supplierId} is null
        or ${storeConnections.supplierId} = ${supplierProducts.supplierId}))`;
}
