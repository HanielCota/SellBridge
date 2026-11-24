import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import type { ReportScope } from "./reports.ts";
import {
  isCountedOrder,
  ORDER_SALE_DATE,
  statusAtPeriodEnd,
  undoneAfterPeriod,
} from "./sql/counted-orders.ts";
import { sqlIntegerSchema, timestampOf } from "./sql/raw-values.ts";

/*
 * The reseller's monthly report needs a few numbers the financial screen does not: orders by
 * status, when the sales happen and the orders behind each problem. Same scope and the same
 * "counted order" rule as reports.ts, so its totals match the dashboard's.
 */

const count = sqlIntegerSchema;

/** Orders `o` of the tenant and, when picked, the store. */
function ownerConditions(scope: ReportScope): SQL {
  const conditions: SQL[] = [sql`o.tenant_id = ${scope.tenantId}`];
  if (scope.storeConnectionId) {
    conditions.push(sql`o.store_connection_id = ${scope.storeConnectionId}`);
  }
  return sql.join(conditions, sql` and `);
}

/** Orders `o` of the scope filed in its Brazil-day range by sale date. */
function scopeConditions(scope: ReportScope): SQL {
  return sql`${ownerConditions(scope)}
    and ${ORDER_SALE_DATE} >= ${timestampOf(scope.range.from)}
    and ${ORDER_SALE_DATE} < ${timestampOf(scope.range.to)}`;
}

/** A sale cancelled or returned only after the period ended: in the period it was still a sale. */
function undoneAfter(scope: ReportScope): SQL {
  return undoneAfterPeriod(scope.range.to);
}

/** A sale of the period, or one that still was when the period ended. */
function countedAtPeriodEnd(scope: ReportScope): SQL {
  return sql`(${isCountedOrder(sql.raw("o.status"))} or ${undoneAfter(scope)})`;
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

/** Every order of the scope by its status when the period ended, sales or not. */
export async function getOrderStatusCounts(
  database: Database,
  scope: ReportScope,
): Promise<OrderStatusCounts> {
  const rows = await database.execute(sql`
    select ${statusAtPeriodEnd(scope.range.to)} as status, count(*) as orders
    from orders o
    where ${scopeConditions(scope)}
    group by 1
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

/**
 * Counted orders (sales) per weekday and six-hour band, Brazil time; empty cells are left out.
 * The cell is when the buyer ordered, the habit it shows, even for a sale paid later.
 */
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
    where ${scopeConditions(scope)} and ${countedAtPeriodEnd(scope)}
    group by 1, 2
    order by 1, 2
  `);
  return z.array(z.object({ weekday: count, band: count, orders: count })).parse([...rows]);
}

export type SellerReportCaseKind =
  "cost_pending" | "unpaid" | "cancelled" | "returned" | "undone_earlier";

/** Sales of an earlier period cancelled or returned in this one. */
function undoneEarlier(scope: ReportScope): SQL {
  const from = timestampOf(scope.range.from);
  const to = timestampOf(scope.range.to);
  return sql`${ownerConditions(scope)} and o.status in ('cancelled', 'returned')
    and ${ORDER_SALE_DATE} < ${from} and o.reversed_at >= ${from} and o.reversed_at < ${to}`;
}

function caseConditions(scope: ReportScope, kind: SellerReportCaseKind): SQL {
  if (kind === "cost_pending") {
    return sql`${scopeConditions(scope)} and ${countedAtPeriodEnd(scope)} and ${HAS_UNKNOWN_COST}`;
  }
  if (kind === "unpaid") {
    return sql`${scopeConditions(scope)} and o.status = 'pending'`;
  }
  if (kind === "undone_earlier") {
    return undoneEarlier(scope);
  }
  // A sale undone only after the period ended was still a sale in it.
  return sql`${scopeConditions(scope)} and o.status = ${kind} and not ${undoneAfter(scope)}`;
}

export interface SellerReportCase {
  id: string;
  externalOrderId: string;
  storeName: string;
  orderedAt: Date;
  paidAt: Date | null;
  /** When a paid sale was cancelled or returned; null while it never was. */
  reversedAt: Date | null;
  status: string;
  totalCents: number;
}

const caseRowSchema = z.object({
  id: z.string(),
  external_order_id: z.string(),
  shop_name: z.string(),
  ordered_at: z.coerce.date(),
  paid_at: z.coerce.date().nullable(),
  reversed_at: z.coerce.date().nullable(),
  status: z.string(),
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
    select o.id, o.external_order_id, s.shop_name, o.ordered_at, o.paid_at, o.reversed_at,
      o.status, o.total_cents,
      count(*) over () as total
    from orders o
    join store_connections s on s.id = o.store_connection_id and s.tenant_id = o.tenant_id
    where ${caseConditions(scope, query.kind)}
    order by ${ORDER_SALE_DATE} desc, o.id
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
      paidAt: row.paid_at,
      reversedAt: row.reversed_at,
      status: row.status,
      totalCents: row.total_cents,
    })),
  };
}
