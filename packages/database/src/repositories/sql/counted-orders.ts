import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Cancelled and returned orders are not sales: they count for no revenue, cost, fee or
 * units sold. Every report, badge and notification uses this one rule.
 */
const UNCOUNTED_STATUSES = sql.raw("('cancelled', 'returned')");

/** True for orders that count as a sale; pass the status column (or `sql.raw("o.status")`). */
export function isCountedOrder(status: SQLWrapper): SQL {
  return sql`${status} not in ${UNCOUNTED_STATUSES}`;
}

/** True for cancelled and returned orders. */
export function isUncountedOrder(status: SQLWrapper): SQL {
  return sql`${status} in ${UNCOUNTED_STATUSES}`;
}
