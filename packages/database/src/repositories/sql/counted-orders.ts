import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Unpaid, cancelled and returned orders are not sales: they count for no revenue, cost, fee or
 * units sold. Every report, badge and notification uses this one rule, the same as
 * `computeOrderFinance` in shared/domain/finance.ts.
 */
const UNCOUNTED_STATUSES = sql.raw("('pending', 'cancelled', 'returned')");

/** True for orders that count as a sale; pass the status column (or `sql.raw("o.status")`). */
export function isCountedOrder(status: SQLWrapper): SQL {
  return sql`${status} not in ${UNCOUNTED_STATUSES}`;
}

/** True for unpaid, cancelled and returned orders. */
export function isUncountedOrder(status: SQLWrapper): SQL {
  return sql`${status} in ${UNCOUNTED_STATUSES}`;
}

/**
 * The date a money report files an order under: when it was paid, so a sale counts in the month
 * the money came in; an order never paid (awaiting payment, cancelled first) by when it was placed.
 * Kept equal to the `orders_tenant_sale_date_idx` expression so the period filter uses the index.
 */
export function saleDate(paidAt: SQLWrapper, orderedAt: SQLWrapper): SQL {
  return sql`coalesce(${paidAt}, ${orderedAt})`;
}

/** `saleDate` of the orders table aliased `o` in raw report queries. */
export const ORDER_SALE_DATE = saleDate(sql.raw("o.paid_at"), sql.raw("o.ordered_at"));
