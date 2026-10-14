import { and, eq, exists, isNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import {
  supplierCoverage,
  supplierProducts,
  suppliers,
  tenantProfile,
} from "../../schema/index.ts";

/** A region given as values (the tenant asking) or as columns (the tenant owning a listing). */
interface RegionRef {
  state: string | SQLWrapper;
  city: string | SQLWrapper;
}

/**
 * The supplier in the query covers the region: the whole state (`city` null) or the city,
 * ignoring letter case. Needs `suppliers` in the FROM clause.
 */
export function coversRegion(region: RegionRef): SQL {
  return exists(
    sql`(select 1 from ${supplierCoverage} where ${and(
      eq(supplierCoverage.supplierId, suppliers.id),
      eq(supplierCoverage.state, region.state),
      or(
        isNull(supplierCoverage.city),
        sql`lower(${supplierCoverage.city}) = lower(${region.city})`,
      ),
    )})`,
  );
}

/**
 * The supplier covers the region of the tenant joined as `tenant_profile` (left join). A tenant
 * without a region keeps its listings: nobody publishes without one, and zeroing live listings
 * over missing data would hurt more than it protects.
 */
export function coversTenantRegion(): SQL {
  return sql`(${tenantProfile.tenantId} is null or ${coversRegion({
    state: tenantProfile.state,
    city: tenantProfile.city,
  })})`;
}

/**
 * Mirrors `unavailableReason` (shared/domain/catalog-availability.ts) being null: active
 * product, active supplier, region covered. Needs `supplier_products`, `suppliers` and a left
 * join on `tenant_profile`.
 */
export function sellableOnMarketplace(): SQL {
  return sql`(${supplierProducts.active} and ${suppliers.active} and ${coversTenantRegion()})`;
}
