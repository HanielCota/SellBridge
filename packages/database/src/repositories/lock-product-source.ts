import { asc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { listings, supplierProducts, suppliers } from "../schema/index.ts";

/** Catalog writers lock the source before the product; publication follows that order. */
export async function shareLockProductSource(executor: DatabaseExecutor, productId: string) {
  const sourceIds = executor
    .select({ id: supplierProducts.supplierId })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId));
  const [source] = await executor
    .select()
    .from(suppliers)
    .where(inArray(suppliers.id, sourceIds))
    .for("share");
  return source;
}

export async function shareLockListingSources(
  executor: DatabaseExecutor,
  listingIds: readonly string[],
) {
  const sourceIds = executor
    .select({ id: supplierProducts.supplierId })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .where(inArray(listings.id, [...listingIds]));
  await executor
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(inArray(suppliers.id, sourceIds))
    .orderBy(asc(suppliers.id))
    .for("share");
}
