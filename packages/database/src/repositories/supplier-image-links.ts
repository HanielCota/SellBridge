import { sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { supplierProducts } from "../schema/index.ts";

/**
 * The photo links of any product that contain `pathFragment` (a supplier's photo folder in the
 * public URL). Every catalog counts, not only the supplier's own: a link is public and can be
 * pasted into another product.
 */
export async function listProductImageLinks(
  database: Database,
  pathFragment: string,
): Promise<string[]> {
  const rows = await database
    .select({ imageUrls: supplierProducts.imageUrls })
    .from(supplierProducts)
    .where(
      sql`exists (select 1 from unnest(${supplierProducts.imageUrls}) as link where strpos(link, ${pathFragment}) > 0)`,
    );
  return rows.flatMap((row) => row.imageUrls.filter((url) => url.includes(pathFragment)));
}
