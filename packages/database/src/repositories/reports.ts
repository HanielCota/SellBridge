import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";

/**
 * Financial reports. Per-order numbers are computed in SQL with the same formula as
 * `computeOrderFinance` in @sellbridge/shared/finance (a test keeps both in sync):
 *   profit = revenue − cost − marketplace fee − refunds + commissions − platform fee
 * Cancelled and returned orders contribute no revenue, cost or fee.
 */

const REPORT_TIME_ZONE = "America/Sao_Paulo";

export interface ReportRange {
  from: Date;
  to: Date;
}

export interface ReportScope {
  tenantId: string;
  range: ReportRange;
  storeConnectionId?: string | undefined;
  platformFeeBasisPoints: number;
}

const cents = z.coerce.number().int();
const count = z.coerce.number().int();

/** CTE with one row per order of the tenant in the range, already with its finances. */
function orderFinanceCte(scope: ReportScope, extraConditions: SQL[] = []): SQL {
  const conditions: SQL[] = [
    sql`o.tenant_id = ${scope.tenantId}`,
    sql`o.ordered_at >= ${scope.range.from.toISOString()}::timestamptz`,
    sql`o.ordered_at < ${scope.range.to.toISOString()}::timestamptz`,
    ...extraConditions,
  ];
  if (scope.storeConnectionId) {
    conditions.push(sql`o.store_connection_id = ${scope.storeConnectionId}`);
  }
  const where = sql.join(conditions, sql` and `);
  return sql`
    order_finance as (
      select
        o.id,
        o.external_order_id,
        o.status,
        o.ordered_at,
        o.buyer_name,
        o.store_connection_id,
        s.shop_name,
        (o.status not in ('cancelled', 'returned')) as counted,
        case when o.status in ('cancelled', 'returned') then 0 else o.total_cents end as revenue,
        case when o.status in ('cancelled', 'returned') then 0 else coalesce(items.cost, 0) end as cost,
        case when o.status in ('cancelled', 'returned') then 0 else o.marketplace_fee_cents end as fee,
        coalesce(adj.refunds, 0) as refunds,
        coalesce(adj.returns, 0) as returns,
        coalesce(adj.commissions, 0) as commissions,
        coalesce(items.titles, '') as item_titles
      from orders o
      join store_connections s on s.id = o.store_connection_id and s.tenant_id = o.tenant_id
      left join lateral (
        select
          sum(i.unit_cost_cents * i.quantity) as cost,
          string_agg(i.title || ' (x' || i.quantity || ')', ', ' order by i.title) as titles
        from order_items i
        where i.order_id = o.id and i.tenant_id = o.tenant_id
      ) items on true
      left join lateral (
        select
          sum(case when a.type = 'refund' then a.amount_cents else 0 end) as refunds,
          sum(case when a.type = 'return' then a.amount_cents else 0 end) as returns,
          sum(case when a.type = 'commission' then a.amount_cents else 0 end) as commissions
        from order_adjustments a
        where a.order_id = o.id and a.tenant_id = o.tenant_id
      ) adj on true
      where ${where}
    ),
    order_profit as (
      select
        f.*,
        round(f.revenue * ${scope.platformFeeBasisPoints}::numeric / 10000)::bigint as platform_fee,
        f.revenue - f.cost - f.fee - f.refunds + f.commissions
          - round(f.revenue * ${scope.platformFeeBasisPoints}::numeric / 10000)::bigint as profit
      from order_finance f
    )`;
}

const summaryRowSchema = z.object({
  orders: count,
  cancelled: count,
  revenue: cents,
  cost: cents,
  fees: cents,
  refunds: cents,
  returns: cents,
  commissions: cents,
  platform_fees: cents,
  profit: cents,
});

export interface SalesSummary {
  orders: number;
  cancelledOrders: number;
  revenueCents: number;
  costCents: number;
  feeCents: number;
  refundCents: number;
  returnCents: number;
  commissionCents: number;
  platformFeeCents: number;
  profitCents: number;
  averageTicketCents: number | null;
}

export async function getSalesSummary(
  database: Database,
  scope: ReportScope,
): Promise<SalesSummary> {
  const rows = await database.execute(sql`
    with ${orderFinanceCte(scope)}
    select
      count(*) filter (where counted) as orders,
      count(*) filter (where not counted) as cancelled,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(cost), 0) as cost,
      coalesce(sum(fee), 0) as fees,
      coalesce(sum(refunds), 0) as refunds,
      coalesce(sum(returns), 0) as returns,
      coalesce(sum(commissions), 0) as commissions,
      coalesce(sum(platform_fee), 0) as platform_fees,
      coalesce(sum(profit), 0) as profit
    from order_profit
  `);
  const row = summaryRowSchema.parse(rows[0]);
  return {
    orders: row.orders,
    cancelledOrders: row.cancelled,
    revenueCents: row.revenue,
    costCents: row.cost,
    feeCents: row.fees,
    refundCents: row.refunds,
    returnCents: row.returns,
    commissionCents: row.commissions,
    platformFeeCents: row.platform_fees,
    profitCents: row.profit,
    averageTicketCents: row.orders > 0 ? Math.round(row.revenue / row.orders) : null,
  };
}

export interface TimeseriesPoint {
  date: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
}

const timeseriesRowSchema = z.object({
  bucket: z.string(),
  orders: count,
  revenue: cents,
  profit: cents,
});

/** Revenue and profit per day or week (Brazil time), with empty buckets filled with zero. */
export async function getSalesTimeseries(
  database: Database,
  scope: ReportScope,
  bucket: "day" | "week",
): Promise<TimeseriesPoint[]> {
  const unit = bucket === "week" ? sql.raw("'week'") : sql.raw("'day'");
  const step = bucket === "week" ? sql.raw("interval '1 week'") : sql.raw("interval '1 day'");
  const rows = await database.execute(sql`
    with ${orderFinanceCte(scope)},
    buckets as (
      select generate_series(
        date_trunc(${unit}, ${scope.range.from.toISOString()}::timestamptz at time zone ${REPORT_TIME_ZONE}),
        date_trunc(${unit}, (${scope.range.to.toISOString()}::timestamptz - interval '1 second') at time zone ${REPORT_TIME_ZONE}),
        ${step}
      ) as bucket
    ),
    grouped as (
      select
        date_trunc(${unit}, ordered_at at time zone ${REPORT_TIME_ZONE}) as bucket,
        count(*) filter (where counted) as orders,
        sum(revenue) as revenue,
        sum(profit) as profit
      from order_profit
      group by 1
    )
    select
      to_char(b.bucket, 'YYYY-MM-DD') as bucket,
      coalesce(g.orders, 0) as orders,
      coalesce(g.revenue, 0) as revenue,
      coalesce(g.profit, 0) as profit
    from buckets b
    left join grouped g on g.bucket = b.bucket
    order by b.bucket
  `);
  return z
    .array(timeseriesRowSchema)
    .parse([...rows])
    .map((row) => ({
      date: row.bucket,
      orders: row.orders,
      revenueCents: row.revenue,
      profitCents: row.profit,
    }));
}

export interface StoreBreakdown {
  storeConnectionId: string;
  storeName: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
}

export async function getSalesByStore(
  database: Database,
  scope: ReportScope,
): Promise<StoreBreakdown[]> {
  const rows = await database.execute(sql`
    with ${orderFinanceCte(scope)}
    select
      store_connection_id,
      shop_name,
      count(*) filter (where counted) as orders,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(profit), 0) as profit
    from order_profit
    group by store_connection_id, shop_name
    order by revenue desc, shop_name asc
  `);
  return z
    .array(
      z.object({
        store_connection_id: z.string(),
        shop_name: z.string(),
        orders: count,
        revenue: cents,
        profit: cents,
      }),
    )
    .parse([...rows])
    .map((row) => ({
      storeConnectionId: row.store_connection_id,
      storeName: row.shop_name,
      orders: row.orders,
      revenueCents: row.revenue,
      profitCents: row.profit,
    }));
}

export interface TopProduct {
  title: string;
  units: number;
  revenueCents: number;
}

export async function getTopProducts(
  database: Database,
  scope: ReportScope,
  limit = 5,
): Promise<TopProduct[]> {
  const rows = await database.execute(sql`
    with ${orderFinanceCte(scope)}
    select
      i.title,
      sum(i.quantity) as units,
      sum(i.unit_price_cents * i.quantity) as revenue
    from order_profit f
    join order_items i on i.order_id = f.id and i.tenant_id = ${scope.tenantId}
    where f.counted
    group by i.title
    order by revenue desc, i.title asc
    limit ${limit}
  `);
  return z
    .array(z.object({ title: z.string(), units: count, revenue: cents }))
    .parse([...rows])
    .map((row) => ({ title: row.title, units: row.units, revenueCents: row.revenue }));
}

export const FINANCIAL_SORT_FIELDS = ["orderedAt", "revenue", "profit", "status"] as const;
export type FinancialSortField = (typeof FINANCIAL_SORT_FIELDS)[number];

const FINANCIAL_SORT_SQL: Record<FinancialSortField, SQL> = {
  orderedAt: sql.raw("ordered_at"),
  revenue: sql.raw("revenue"),
  profit: sql.raw("profit"),
  status: sql.raw("status"),
};

export interface FinancialFilters {
  status?: string | undefined;
  search?: string | undefined;
}

export interface FinancialSort {
  field: FinancialSortField;
  direction: "asc" | "desc";
}

export interface OrderFinancialRow {
  id: string;
  externalOrderId: string;
  orderedAt: Date;
  status: string;
  storeName: string;
  buyerName: string | null;
  items: string;
  revenueCents: number;
  costCents: number;
  feeCents: number;
  refundCents: number;
  returnCents: number;
  commissionCents: number;
  platformFeeCents: number;
  profitCents: number;
}

const financialRowSchema = z.object({
  id: z.string(),
  external_order_id: z.string(),
  ordered_at: z.coerce.date(),
  status: z.string(),
  shop_name: z.string(),
  buyer_name: z.string().nullable(),
  item_titles: z.string(),
  revenue: cents,
  cost: cents,
  fee: cents,
  refunds: cents,
  returns: cents,
  commissions: cents,
  platform_fee: cents,
  profit: cents,
});

function toFinancialRow(row: z.infer<typeof financialRowSchema>): OrderFinancialRow {
  return {
    id: row.id,
    externalOrderId: row.external_order_id,
    orderedAt: row.ordered_at,
    status: row.status,
    storeName: row.shop_name,
    buyerName: row.buyer_name,
    items: row.item_titles,
    revenueCents: row.revenue,
    costCents: row.cost,
    feeCents: row.fee,
    refundCents: row.refunds,
    returnCents: row.returns,
    commissionCents: row.commissions,
    platformFeeCents: row.platform_fee,
    profitCents: row.profit,
  };
}

function financialConditions(filters: FinancialFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.status) {
    conditions.push(sql`o.status = ${filters.status}`);
  }
  if (filters.search) {
    const term = `%${filters.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(
      sql`(o.external_order_id ilike ${term} or coalesce(o.buyer_name, '') ilike ${term}
        or exists (select 1 from order_items si where si.order_id = o.id and si.title ilike ${term}))`,
    );
  }
  return conditions;
}

function orderBy(sort: FinancialSort): SQL {
  const direction = sort.direction === "asc" ? sql.raw("asc") : sql.raw("desc");
  return sql`order by ${FINANCIAL_SORT_SQL[sort.field]} ${direction}, ordered_at desc, id`;
}

export async function listOrderFinancials(
  database: Database,
  scope: ReportScope,
  filters: FinancialFilters,
  sort: FinancialSort,
  pagination: Pagination,
): Promise<Paginated<OrderFinancialRow>> {
  const cte = orderFinanceCte(scope, financialConditions(filters));
  const [rows, totals] = await Promise.all([
    database.execute(sql`
      with ${cte}
      select * from order_profit
      ${orderBy(sort)}
      limit ${pagination.pageSize} offset ${(pagination.page - 1) * pagination.pageSize}
    `),
    database.execute(sql`with ${cte} select count(*) as total from order_profit`),
  ]);
  const total = z.object({ total: count }).parse(totals[0]).total;
  const items = z
    .array(financialRowSchema)
    .parse([...rows])
    .map(toFinancialRow);
  return toPaginated(items, total, pagination);
}

/** All matching rows for CSV export, capped to protect the server. */
export async function exportOrderFinancials(
  database: Database,
  scope: ReportScope,
  filters: FinancialFilters,
  sort: FinancialSort,
  maxRows = 20_000,
): Promise<OrderFinancialRow[]> {
  const rows = await database.execute(sql`
    with ${orderFinanceCte(scope, financialConditions(filters))}
    select * from order_profit
    ${orderBy(sort)}
    limit ${maxRows}
  `);
  return z
    .array(financialRowSchema)
    .parse([...rows])
    .map(toFinancialRow);
}
