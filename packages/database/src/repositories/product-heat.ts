import { PRODUCT_HEAT_WINDOW_IN_DAYS } from "@sellbridge/shared/product-heat";
import { and, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orderItems, orders } from "../schema/index.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";

const DAY_IN_MS = 86_400_000;

/** Where the heat window that ends at `now` starts. */
export function heatWindowStart(now: Date): Date {
  return new Date(now.getTime() - PRODUCT_HEAT_WINDOW_IN_DAYS * DAY_IN_MS);
}

/** Orders that count as sales of the heat window starting at `since`. */
function countedSaleSince(since: Date): SQL | undefined {
  return and(gte(orders.orderedAt, since), isCountedOrder(orders.status));
}

/**
 * Units of each product sold since `since`, summed once over the window's sales, the count of
 * `countRecentUnitsSold` as a subquery a catalog query can join and sort by. Products without
 * sales have no row.
 */
export function recentUnitsSoldByProduct(database: Database, since: Date) {
  return database
    .select({
      productId: orderItems.supplierProductId,
      units: sql<number>`sum(${orderItems.quantity})`.as("recent_units"),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(countedSaleSince(since))
    .groupBy(orderItems.supplierProductId)
    .as("recent_sales");
}

/**
 * Units of each product sold in the heat window, summed over every SellBridge store; products
 * with no sale are left out. Only totals come back: never which reseller or store sold them.
 * Keyed by product, so it holds however stores and suppliers relate.
 *
 * @param now - The window ends here; injectable for tests.
 */
export async function countRecentUnitsSold(
  database: Database,
  productIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  if (productIds.length === 0) {
    return new Map();
  }
  const since = heatWindowStart(now);
  const rows = await database
    .select({
      productId: orderItems.supplierProductId,
      units: sql<number>`sum(${orderItems.quantity})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(inArray(orderItems.supplierProductId, [...productIds]), countedSaleSince(since)))
    .groupBy(orderItems.supplierProductId);
  const unitsByProduct = new Map<string, number>();
  for (const row of rows) {
    if (row.productId === null) {
      continue;
    }
    if (!Number.isInteger(row.units)) {
      throw new Error(`Units sold for product ${row.productId} is not an integer: ${row.units}`);
    }
    unitsByProduct.set(row.productId, row.units);
  }
  return unitsByProduct;
}
