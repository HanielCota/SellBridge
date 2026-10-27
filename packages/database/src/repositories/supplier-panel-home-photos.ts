import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { supplierProducts } from "../schema/index.ts";

/**
 * The main photo of each of the supplier's products among `skus`, keyed by SKU. A parcel's items
 * keep only the title, SKU and quantity of the sale, so the home page finds the photo through the
 * supplier's own catalog. SKUs without a product or without a photo are left out.
 */
export async function listSupplierProductPhotos(
  database: Database,
  input: { supplierId: string; skus: readonly string[] },
): Promise<ReadonlyMap<string, string>> {
  const skus = [...new Set(input.skus.filter((sku) => sku !== ""))];
  if (skus.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      sku: supplierProducts.sku,
      imageUrl: sql<string | null>`${supplierProducts.imageUrls}[1]`,
    })
    .from(supplierProducts)
    .where(
      and(eq(supplierProducts.supplierId, input.supplierId), inArray(supplierProducts.sku, skus)),
    );
  const photos = rows.flatMap((row) =>
    row.imageUrl === null ? [] : [[row.sku, row.imageUrl] as const],
  );
  return new Map(photos);
}
