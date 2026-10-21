import { sql, type SQL } from "drizzle-orm";
import {
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../../schema/index.ts";

/**
 * Own products fit their owner's stores. Public products follow the selected supplier;
 * supplier-free legacy stores keep existing publications. Needs `listing_targets` in FROM.
 */
export function targetMatchesStoreSupplier(): SQL {
  return sql`exists (select 1 from ${storeConnections}
    inner join ${listings} on ${listings.id} = ${listingTargets.listingId}
    inner join ${supplierProducts} on ${supplierProducts.id} = ${listings.supplierProductId}
    inner join ${suppliers} on ${suppliers.id} = ${supplierProducts.supplierId}
    where ${storeConnections.id} = ${listingTargets.storeConnectionId}
      and ${storeConnections.tenantId} = ${listingTargets.tenantId}
      and ${listings.tenantId} = ${listingTargets.tenantId}
      and ((${suppliers.catalogKind} = 'seller' and ${suppliers.ownerTenantId} = ${listingTargets.tenantId})
        or (${suppliers.catalogKind} = 'supplier' and (${storeConnections.supplierId} is null
          or ${storeConnections.supplierId} = ${supplierProducts.supplierId}))))`;
}
