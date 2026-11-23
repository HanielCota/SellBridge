import { sql } from "drizzle-orm";
import { supplierProducts } from "../../schema/index.ts";

const packedText = sql`btrim(${supplierProducts.mercadoLivreAttributes}->>'SELLER_PACKAGE_WEIGHT', E' \t\r\n')`;

/** `readPackageMeasure(text, "g")` of shared/shipping-weight.ts; null for zero or unreadable text. */
const packedGrams = sql`case when ${packedText} ~* '^[0-9]+([.,][0-9]+)?[[:space:]]*g?$' then nullif(ceil(replace(substring(${packedText} from '^[0-9]+(?:[.,][0-9]+)?'), ',', '.')::numeric), 0)::integer end`;

const netGrams = sql`case when jsonb_typeof(${supplierProducts.fiscal}->'netWeightGrams') = 'number' and (${supplierProducts.fiscal}->>'netWeightGrams')::numeric > 0 then ceil((${supplierProducts.fiscal}->>'netWeightGrams')::numeric)::integer end`;

/**
 * The weight shipping is priced on, in grams: `shippingWeightGrams` of shared/shipping-weight.ts
 * in SQL. The packed weight the supplier typed, else the NF-e net weight; null when neither is
 * there. Needs `supplier_products` in the FROM clause.
 */
export const productWeightGrams = sql<number | null>`coalesce(${packedGrams}, ${netGrams})`;
