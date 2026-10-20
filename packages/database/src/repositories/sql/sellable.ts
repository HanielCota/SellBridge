import { sql, type SQL } from "drizzle-orm";
import { supplierProducts, suppliers } from "../../schema/index.ts";

/** Public supplier reads must never expose a seller's private inventory source. */
export function publicSupplier(): SQL {
  return sql`${suppliers.catalogKind} = 'supplier'`;
}

/** An authenticated tenant may also read its own private catalog, never another seller's. */
export function catalogVisibleTo(tenantId?: string): SQL {
  if (tenantId === undefined) return publicSupplier();
  return sql`(${publicSupplier()} or (${suppliers.catalogKind} = 'seller' and ${suppliers.ownerTenantId} = ${tenantId}))`;
}

/**
 * A product resellers may see, list and publish: active and approved by the platform. Drafts,
 * products under review and rejected ones from the supplier panel stay out (migration 0039).
 * Needs `supplier_products` in the FROM clause.
 */
export function productListable(): SQL {
  return sql`(${supplierProducts.active} and ${supplierProducts.reviewStatus} = 'approved')`;
}

/** `productListable` as a column, for `CatalogAvailability.productActive`. */
export function productListableColumn(): SQL<boolean> {
  return sql<boolean>`${productListable()}`.mapWith(Boolean);
}

/**
 * Mirrors `unavailableReason` (shared/domain/catalog-availability.ts) being null: a listable
 * product of an active supplier. Where the reseller lives plays no part. Needs
 * `supplier_products` and `suppliers` in the FROM clause.
 */
export function sellableOnMarketplace(): SQL {
  return sql`(${productListable()} and ${suppliers.active})`;
}

/**
 * A supplier resellers may find: active, with at least one listable product. Suppliers who sign
 * up on their own start empty, and an empty catalog is noise in every reseller picker. Needs
 * `suppliers` in the FROM clause.
 */
export function supplierFindable(): SQL {
  return sql`(${publicSupplier()} and ${suppliers.active} and exists (select 1 from ${supplierProducts} where ${supplierProducts.supplierId} = ${suppliers.id} and ${productListable()}))`;
}
