import { sql, type SQL } from "drizzle-orm";
import { supplierProducts, suppliers } from "../../schema/index.ts";

/**
 * Mirrors `unavailableReason` (shared/domain/catalog-availability.ts) being null: active
 * product of an active supplier. Where the reseller lives plays no part. Needs
 * `supplier_products` and `suppliers` in the FROM clause.
 */
export function sellableOnMarketplace(): SQL {
  return sql`(${supplierProducts.active} and ${suppliers.active})`;
}
