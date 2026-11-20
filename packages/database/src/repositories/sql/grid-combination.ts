import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { supplierProducts } from "../../schema/index.ts";

/**
 * For an upsert's SET: the imported value on a product of its own, the stored one on a combination
 * of a colour and size grid. A combination's shared data (title, photos, sheet, NF-e) is written
 * from its model only, so an import never leaves one combination out of step with the others.
 * Needs `supplier_products` as the upsert's target.
 */
export function keptOnCombination(imported: SQL, stored: AnyColumn): SQL {
  return sql`case when ${supplierProducts.modelId} is null then ${imported} else ${stored} end`;
}
