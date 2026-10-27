import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import type { ReportScope } from "./reports.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { sqlIntegerSchema, timestampOf } from "./sql/raw-values.ts";

/*
 * The reseller's monthly report needs a few numbers the financial screen does not: orders by
 * status, when the sales happen and the orders behind each problem. Same scope and the same
 * "counted order" rule as reports.ts, so its totals match the dashboard's.
 */

const count = sqlIntegerSchema;

/** Orders `o` of the scope: tenant, Brazil-day range and optional store. */
function scopeConditions(scope: ReportScope): SQL {
  const conditions: SQL[] = [
    sql`o.tenant_id = ${scope.tenantId}`,
    sql`o.ordered_at >= ${timestampOf(scope.range.from)}`,
    sql`o.ordered_at < ${timestampOf(scope.range.to)}`,
  ];
  if (scope.storeConnectionId) {
    conditions.push(sql`o.store_connection_id = ${scope.storeConnectionId}`);
  }
  return sql.join(conditions, sql` and `);
}

/** A sale with an item of unknown cost (no catalog product), as `COST_PENDING` in reports.ts. */
const HAS_UNKNOWN_COST = sql`exists (select 1 from order_items i
  where i.order_id = o.id and i.tenant_id = o.tenant_id and i.supplier_product_id is null)`;

const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
] as const;

export type OrderStatusCounts = Record<(typeof ORDER_STATUSES)[number], number>;

const EMPTY_STATUS_COUNTS: OrderStatusCounts = {
  pending: 0,
  paid: 0,
  shipped: 0,
  delivered: 0,
  cancelled: 0,
  returned: 0,
};

/** Every order of the scope by status, sales or not. */
export async function getOrderStatusCounts(
  database: Database,
  scope: ReportScope,
): Promise<OrderStatusCounts> {
  const rows = await database.execute(sql`
    select o.status, count(*) as orders
    from orders o
    where ${scopeConditions(scope)}
    group by o.status
  `);
  const parsed = z
    .array(z.object({ status: z.enum(ORDER_STATUSES), orders: count }))
    .parse([...rows]);
  return parsed.reduce<OrderStatusCounts>(
    (counts, row) => ({ ...counts, [row.status]: row.orders }),
    EMPTY_STATUS_COUNTS,
  );
}

export interface SalesHeatmapCell {
  /** ISO weekday in Brazil time: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** 0 = 00h–06h, 1 = 06h–12h, 2 = 12h–18h, 3 = 18h–24h. */
  band: number;
  orders: number;
}

/** Counted orders (sales) per weekday and six-hour band, Brazil time; empty cells are left out. */
export async function getSalesHeatmap(
  database: Database,
  scope: ReportScope,
): Promise<SalesHeatmapCell[]> {
  const rows = await database.execute(sql`
    select
      extract(isodow from o.ordered_at at time zone ${REPORT_TIME_ZONE})::int as weekday,
      (extract(hour from o.ordered_at at time zone ${REPORT_TIME_ZONE})::int / 6) as band,
      count(*) as orders
    from orders o
    where ${scopeConditions(scope)} and ${isCountedOrder(sql.raw("o.status"))}
    group by 1, 2
    order by 1, 2
  `);
  return z.array(z.object({ weekday: count, band: count, orders: count })).parse([...rows]);
}

export type SellerReportCaseKind = "cost_pending" | "cancelled" | "returned";

const CASE_CONDITIONS: Record<SellerReportCaseKind, SQL> = {
  cost_pending: sql`${isCountedOrder(sql.raw("o.status"))} and ${HAS_UNKNOWN_COST}`,
  cancelled: sql`o.status = 'cancelled'`,
  returned: sql`o.status = 'returned'`,
};

export interface SellerReportCase {
  id: string;
  externalOrderId: string;
  storeName: string;
  orderedAt: Date;
  totalCents: number;
}

const caseRowSchema = z.object({
  id: z.string(),
  external_order_id: z.string(),
  shop_name: z.string(),
  ordered_at: z.coerce.date(),
  total_cents: count,
  total: count,
});

/** The newest `limit` orders of one problem kind, and how many there are in all. */
export async function listSellerReportCases(
  database: Database,
  scope: ReportScope,
  query: { kind: SellerReportCaseKind; limit: number },
): Promise<{ total: number; items: SellerReportCase[] }> {
  const rows = await database.execute(sql`
    select o.id, o.external_order_id, s.shop_name, o.ordered_at, o.total_cents,
      count(*) over () as total
    from orders o
    join store_connections s on s.id = o.store_connection_id and s.tenant_id = o.tenant_id
    where ${scopeConditions(scope)} and ${CASE_CONDITIONS[query.kind]}
    order by o.ordered_at desc, o.id
    limit ${query.limit}
  `);
  const parsed = z.array(caseRowSchema).parse([...rows]);
  return {
    total: parsed[0]?.total ?? 0,
    items: parsed.map((row) => ({
      id: row.id,
      externalOrderId: row.external_order_id,
      storeName: row.shop_name,
      orderedAt: row.ordered_at,
      totalCents: row.total_cents,
    })),
  };
}
