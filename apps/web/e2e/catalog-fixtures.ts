import type { Database } from "@sellbridge/database/client";
import { supplierProducts, suppliers } from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";

/**
 * A product resellers can order and forward: active and approved, from an active supplier of the
 * public catalog. The shared database also holds products and suppliers other tests switched
 * off, and taking "the first product" picked one of those, whose order could not be forwarded.
 */
export async function forwardableProduct(database: Database) {
  const [listed] = await database
    .select({ product: supplierProducts })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        eq(supplierProducts.active, true),
        eq(supplierProducts.reviewStatus, "approved"),
        eq(suppliers.active, true),
        eq(suppliers.catalogKind, "supplier"),
      ),
    )
    .limit(1);
  return listed?.product;
}
