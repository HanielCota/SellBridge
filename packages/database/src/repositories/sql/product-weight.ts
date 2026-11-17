import { sql } from "drizzle-orm";
import { supplierProducts } from "../../schema/index.ts";

/**
 * The product's net weight in grams from its NF-e data, or null when the supplier gave none: the
 * weight the shipping estimate is priced on. Only a positive number counts. Needs
 * `supplier_products` in the FROM clause.
 */
export const productWeightGrams = sql<
  number | null
>`case when jsonb_typeof(${supplierProducts.fiscal}->'netWeightGrams') = 'number' and (${supplierProducts.fiscal}->>'netWeightGrams')::numeric > 0 then ceil((${supplierProducts.fiscal}->>'netWeightGrams')::numeric)::integer end`;
