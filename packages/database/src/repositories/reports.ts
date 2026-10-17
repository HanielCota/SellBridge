import { validationError } from "@sellbridge/shared/errors";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { isCountedOrder, isUncountedOrder } from "./sql/counted-orders.ts";
import { sqlIntegerSchema, timestampOf } from "./sql/raw-values.ts";
import { containsPattern } from "./sql/search-pattern.ts";
import { BUCKET_SQL, type TimeseriesBucket } from "./sql/timeseries-buckets.ts";

export type { TimeseriesBucket };

/**
 * Financial reports. Per-order numbers are computed in SQL with the same formula as
 * `computeOrderFinance` in @sellbridge/shared/finance (a test keeps both in sync):
 *   profit = revenue − cost − marketplace fee − refunds + commissions − platform fee
 * Cancelled and returned orders contribute no revenue, cost or fee. A sale with an item of
 * unknown cost (no catalog product: a listing created outside SellBridge) keeps its revenue,
 * set apart as `pending_revenue`, and contributes nothing else.
 */

/** The orders table is aliased `o` in the raw report queries. */
const ORDER_STATUS = sql.raw("o.status");

/** A sale with an item of unknown cost; `items` is the lateral join over the order's items. */
const COST_PENDING = sql`(${isCountedOrder(ORDER_STATUS)} and coalesce(items.unknown_cost, false))`;

/** Orders whose cost, fee and adjustments stay out of the profit: not sales, or cost pending. */
const OUT_OF_PROFIT = sql`(${isUncountedOrder(ORDER_STATUS)} or coalesce(items.unknown_cost, false))`;

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

const cents = sqlIntegerSchema;
const count = sqlIntegerSchema;

/** Per order `o`: its items' cost, whether any of them has an unknown cost, and their titles. */
const ORDER_ITEMS_LATERAL = sql`
  left join lateral (
    select
      sum(i.unit_cost_cents::bigint * i.quantity) as cost,
      bool_or(i.supplier_product_id is null) as unknown_cost,
      string_agg(i.title || ' (x' || i.quantity || ')', ', ' order by i.title) as titles
    from order_items i
    where i.order_id = o.id and i.tenant_id = o.tenant_id
  ) items on true`;

/** Per order `o`: its refunds, returns and commissions. */
const ORDER_ADJUSTMENTS_LATERAL = sql`
  left join lateral (
    select
      sum(case when a.type = 'refund' then a.amount_cents else 0 end) as refunds,
      sum(case when a.type = 'return' then a.amount_cents else 0 end) as returns,
      sum(case when a.type = 'commission' then a.amount_cents else 0 end) as commissions
    from order_adjustments a
    where a.order_id = o.id and a.tenant_id = o.tenant_id
  ) adj on true`;

/** CTE with one row per order of the tenant in the range, already with its finances. */
function orderFinanceCte(scope: ReportScope, extraConditions: SQL[] = []): SQL {
  const conditions: SQL[] = [
    sql`o.tenant_id = ${scope.tenantId}`,
    sql`o.ordered_at >= ${timestampOf(scope.range.from)}`,
    sql`o.ordered_at < ${timestampOf(scope.range.to)}`,
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
        o.delivered_at,
        o.buyer_name,
        o.store_connection_id,
        s.shop_name,
        (${isCountedOrder(ORDER_STATUS)}) as counted,
        ${COST_PENDING} as cost_pending,
        case when ${isUncountedOrder(ORDER_STATUS)} then 0 else o.total_cents end as revenue,
        case when ${COST_PENDING} then o.total_cents else 0 end as pending_revenue,
        case when ${OUT_OF_PROFIT} then 0 else coalesce(items.cost, 0) end as cost,
        case when ${OUT_OF_PROFIT} then 0 else o.marketplace_fee_cents end as fee,
        case when ${COST_PENDING} then 0 else coalesce(adj.refunds, 0) end as refunds,
        case when ${COST_PENDING} then 0 else coalesce(adj.returns, 0) end as returns,
        case when ${COST_PENDING} then 0 else coalesce(adj.commissions, 0) end as commissions,
        coalesce(items.titles, '') as item_titles
      from orders o
      join store_connections s on s.id = o.store_connection_id and s.tenant_id = o.tenant_id
      ${ORDER_ITEMS_LATERAL}
      ${ORDER_ADJUSTMENTS_LATERAL}
      where ${where}
    ),
    order_profit as (
      select
        f.*,
        round((f.revenue - f.pending_revenue) * ${scope.platformFeeBasisPoints}::numeric / 10000)::bigint
          as platform_fee,
        f.revenue - f.pending_revenue - f.cost - f.fee - f.refunds + f.commissions
          - round((f.revenue - f.pending_revenue) * ${scope.platformFeeBasisPoints}::numeric / 10000)::bigint
          as profit
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
  pending_orders: count,
  pending_revenue: cents,
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
  /** Sales with an item of unknown cost: in the revenue, out of the profit. */
  pendingCostOrders: number;
  pendingCostRevenueCents: number;
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
      -- Cancelled or returned only: an order still awaiting payment is not counted as a sale,
      -- but it was not cancelled either.
      count(*) filter (where status in ('cancelled', 'returned')) as cancelled,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(cost), 0) as cost,
      coalesce(sum(fee), 0) as fees,
      coalesce(sum(refunds), 0) as refunds,
      coalesce(sum(returns), 0) as returns,
      coalesce(sum(commissions), 0) as commissions,
      coalesce(sum(platform_fee), 0) as platform_fees,
      coalesce(sum(profit), 0) as profit,
      count(*) filter (where cost_pending) as pending_orders,
      coalesce(sum(pending_revenue), 0) as pending_revenue
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
    pendingCostOrders: row.pending_orders,
    pendingCostRevenueCents: row.pending_revenue,
    averageTicketCents: row.orders > 0 ? Math.round(row.revenue / row.orders) : null,
  };
}

export interface TimeseriesPoint {
  date: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
  /** Revenue of the bucket's sales of unknown cost, left out of its profit. */
  pendingCostRevenueCents: number;
}

const timeseriesRowSchema = z.object({
  bucket: z.string(),
  orders: count,
  revenue: cents,
  profit: cents,
  pending_revenue: cents,
});

/**
 * Revenue and profit per hour, day, week or month (Brazil time), with empty buckets filled with
 * zero.
 */
export async function getSalesTimeseries(
  database: Database,
  scope: ReportScope,
  bucket: TimeseriesBucket,
): Promise<TimeseriesPoint[]> {
  const { unit, step, label } = BUCKET_SQL[bucket];
  const rows = await database.execute(sql`
    with ${orderFinanceCte(scope)},
    buckets as (
      select generate_series(
        date_trunc(${unit}, ${timestampOf(scope.range.from)} at time zone ${REPORT_TIME_ZONE}),
        date_trunc(${unit}, (${timestampOf(scope.range.to)} - interval '1 second') at time zone ${REPORT_TIME_ZONE}),
        ${step}
      ) as bucket
    ),
    grouped as (
      select
        date_trunc(${unit}, ordered_at at time zone ${REPORT_TIME_ZONE}) as bucket,
        count(*) filter (where counted) as orders,
        sum(revenue) as revenue,
        sum(profit) as profit,
        sum(pending_revenue) as pending_revenue
      from order_profit
      group by 1
    )
    select
      to_char(b.bucket, ${label}) as bucket,
      coalesce(g.orders, 0) as orders,
      coalesce(g.revenue, 0) as revenue,
      coalesce(g.profit, 0) as profit,
      coalesce(g.pending_revenue, 0) as pending_revenue
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
      pendingCostRevenueCents: row.pending_revenue,
    }));
}

export interface StoreBreakdown {
  storeConnectionId: string;
  storeName: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
  pendingCostRevenueCents: number;
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
      coalesce(sum(profit), 0) as profit,
      coalesce(sum(pending_revenue), 0) as pending_revenue
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
        pending_revenue: cents,
      }),
    )
    .parse([...rows])
    .map((row) => ({
      storeConnectionId: row.store_connection_id,
      storeName: row.shop_name,
      orders: row.orders,
      revenueCents: row.revenue,
      profitCents: row.profit,
      pendingCostRevenueCents: row.pending_revenue,
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
      sum(i.unit_price_cents::bigint * i.quantity) as revenue
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

const FINANCIAL_SORT_FIELDS = ["orderedAt", "revenue", "profit", "status"] as const;
export type FinancialSortField = (typeof FINANCIAL_SORT_FIELDS)[number];

const FINANCIAL_SORT_SQL: Record<FinancialSortField, SQL> = {
  orderedAt: sql.raw("ordered_at"),
  revenue: sql.raw("revenue"),
  profit: sql.raw("profit"),
  status: sql.raw("status"),
};

export interface FinancialFilters {
  statuses?: readonly string[] | undefined;
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
  deliveredAt: Date | null;
  status: string;
  storeConnectionId: string;
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
  /** A sale with an item of unknown cost: every amount but the revenue is zero. */
  costPending: boolean;
  pendingCostRevenueCents: number;
  /** First item by title, for the card's picture: its title carries the variant color. */
  product: { title: string; imageUrl: string | null; categoryName: string | null } | null;
}

const financialRowSchema = z.object({
  id: z.string(),
  external_order_id: z.string(),
  ordered_at: z.coerce.date(),
  delivered_at: z.coerce.date().nullable(),
  status: z.string(),
  store_connection_id: z.string(),
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
  cost_pending: z.boolean(),
  pending_revenue: cents,
  product_title: z.string().nullable(),
  product_image_url: z.string().nullable(),
  product_category: z.string().nullable(),
});

function toFinancialRow(row: z.infer<typeof financialRowSchema>): OrderFinancialRow {
  return {
    id: row.id,
    externalOrderId: row.external_order_id,
    orderedAt: row.ordered_at,
    deliveredAt: row.delivered_at,
    status: row.status,
    storeConnectionId: row.store_connection_id,
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
    costPending: row.cost_pending,
    pendingCostRevenueCents: row.pending_revenue,
    product:
      row.product_title === null
        ? null
        : {
            title: row.product_title,
            imageUrl: row.product_image_url,
            categoryName: row.product_category,
          },
  };
}

function financialConditions(filters: FinancialFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.statuses && filters.statuses.length > 0) {
    const statuses = sql.join(
      filters.statuses.map((status) => sql`${status}`),
      sql`, `,
    );
    conditions.push(sql`o.status in (${statuses})`);
  }
  if (filters.search) {
    const term = containsPattern(filters.search);
    conditions.push(
      sql`(o.external_order_id ilike ${term} or coalesce(o.buyer_name, '') ilike ${term}
        or exists (select 1 from order_items si
          where si.order_id = o.id and si.tenant_id = o.tenant_id and si.title ilike ${term}))`,
    );
  }
  return conditions;
}

function orderBy(sort: FinancialSort): SQL {
  const direction = sort.direction === "asc" ? sql.raw("asc") : sql.raw("desc");
  return sql`order by ${FINANCIAL_SORT_SQL[sort.field]} ${direction}, ordered_at desc, id`;
}

/**
 * Continues the finance CTE: sorts and cuts the page first, then looks up each order's first
 * item picture and category, so only the rows on screen pay for the product lookup.
 */
function ordersWithProduct(tenantId: string, sort: FinancialSort, limit: SQL): SQL {
  return sql`,
    page as (select * from order_profit ${orderBy(sort)} ${limit})
    select page.*, product.title as product_title, product.image_url as product_image_url,
      product.category_name as product_category
    from page
    left join lateral (
      select i.title, sp.image_urls[1] as image_url, c.name as category_name
      from order_items i
      left join supplier_products sp on sp.id = i.supplier_product_id
      left join categories c on c.id = sp.category_id
      where i.order_id = page.id and i.tenant_id = ${tenantId}
      order by i.title
      limit 1
    ) product on true
    ${orderBy(sort)}`;
}

export interface FinancialListQuery {
  readonly filters: FinancialFilters;
  readonly sort: FinancialSort;
  readonly pagination: Pagination;
}

export async function listOrderFinancials(
  database: Database,
  scope: ReportScope,
  query: FinancialListQuery,
): Promise<Paginated<OrderFinancialRow>> {
  const { filters, sort, pagination } = query;
  const cte = orderFinanceCte(scope, financialConditions(filters));
  const [rows, totals] = await Promise.all([
    database.execute(sql`
      with ${cte}
      ${ordersWithProduct(
        scope.tenantId,
        sort,
        sql`limit ${pagination.pageSize} offset ${(pagination.page - 1) * pagination.pageSize}`,
      )}
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
export interface FinancialExportQuery {
  readonly filters: FinancialFilters;
  readonly sort: FinancialSort;
  readonly maxRows?: number;
}

/** Orders one CSV export carries: larger periods are refused, never cut short. */
export const MAX_FINANCIAL_EXPORT_ROWS = 20_000;

/**
 * Every order of the period, for the CSV. A period with more than `maxRows` orders is refused:
 * a file cut at the limit would look complete and its totals would not match the report.
 */
export async function exportOrderFinancials(
  database: Database,
  scope: ReportScope,
  query: FinancialExportQuery,
): Promise<OrderFinancialRow[]> {
  const { filters, sort, maxRows = MAX_FINANCIAL_EXPORT_ROWS } = query;
  const rows = await database.execute(sql`
    with ${orderFinanceCte(scope, financialConditions(filters))}
    ${ordersWithProduct(scope.tenantId, sort, sql`limit ${maxRows + 1}`)}
  `);
  if (rows.length > maxRows) {
    throw validationError(
      `O período tem mais de ${maxRows.toLocaleString("pt-BR")} pedidos. Exporte um período menor.`,
    );
  }
  return z
    .array(financialRowSchema)
    .parse([...rows])
    .map(toFinancialRow);
}
