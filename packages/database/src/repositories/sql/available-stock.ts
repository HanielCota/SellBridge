import { sql } from "drizzle-orm";
import { supplierProducts } from "../../schema/index.ts";

/**
 * Units a reseller can still sell: the shelf count minus what paid orders hold (see
 * shared/domain/stock-reservation.ts). Every reseller-facing read uses this, never `stock`.
 */
export const availableStock =
  sql<number>`greatest(${supplierProducts.stock} - ${supplierProducts.reservedStock}, 0)`.mapWith(
    Number,
  );
