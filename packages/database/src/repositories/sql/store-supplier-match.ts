import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  listings,
  listingTargets,
  storeConnections,
  storeSuppliers,
  supplierProducts,
  suppliers,
} from "../../schema/index.ts";

/** The shop's suppliers, oldest link first; empty while the shop is pending. */
export function storeSupplierIds(storeConnectionId: AnyPgColumn): SQL<string[]> {
  return sql<string[]>`coalesce((select array_agg(${storeSuppliers.supplierId}::text
      order by ${storeSuppliers.createdAt}, ${storeSuppliers.supplierId})
    from ${storeSuppliers} where ${storeSuppliers.storeConnectionId} = ${storeConnectionId}),
    '{}'::text[])`;
}

/**
 * Own products fit their owner's stores. Public products need their supplier linked to the shop;
 * pending legacy stores (no supplier linked) keep existing publications. Needs `listing_targets`
 * in FROM.
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
        or (${suppliers.catalogKind} = 'supplier' and (
          not exists (select 1 from ${storeSuppliers}
            where ${storeSuppliers.storeConnectionId} = ${storeConnections.id})
          or exists (select 1 from ${storeSuppliers}
            where ${storeSuppliers.storeConnectionId} = ${storeConnections.id}
              and ${storeSuppliers.supplierId} = ${supplierProducts.supplierId})))))`;
}
