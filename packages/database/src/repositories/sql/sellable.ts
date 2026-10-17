import { sql, type SQL } from "drizzle-orm";
import { supplierProducts, suppliers } from "../../schema/index.ts";

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
