import { validationError } from "@sellbridge/shared/errors";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { isCountedOrder, isUncountedOrder, ORDER_SALE_DATE } from "./sql/counted-orders.ts";
import { sqlIntegerSchema, timestampOf } from "./sql/raw-values.ts";
import { sellerShippingOnce } from "./sql/seller-shipping.ts";
import { containsPattern } from "./sql/search-pattern.ts";
import { BUCKET_SQL, type TimeseriesBucket } from "./sql/timeseries-buckets.ts";

export type { TimeseriesBucket };

/**
 * Financial reports. Per-order numbers are computed in SQL with the same formula as
 * `computeOrderFinance` in @sellbridge/shared/finance (a test keeps both in sync):
 *   profit = revenue − cost − marketplace fee − refunds + commissions
 * Orders are filed by `saleDate` (counted-orders.ts): a sale in the period it was paid, an order
 * never paid in the period it was placed.
 * Cancelled and returned orders contribute no revenue, cost or fee. A sale with an item of
 * unknown cost (no catalog product: a listing created outside SellBridge) keeps its revenue,
 * set apart as `pending_revenue`, and contributes nothing else.
 * Each thing counts in the period it happened (docs/decisions/2026-11-23-cancelamento-no-mes-em-que-aconteceu.md):
 * a sale undone (cancelled or returned) after its period ended still counts there, and the
 * period of the reversal takes it back as a negative row ("from an earlier period"); refunds and
 * returns count by the date they were recorded. So a period that has ended never changes.
 */

/** The orders table is aliased `o` in the raw report queries. */
const ORDER_STATUS = sql.raw("o.status");

export interface ReportRange {
  from: Date;
  to: Date;
}

export interface ReportScope {
  tenantId: string;
  range: ReportRange;
  storeConnectionId?: string | undefined;
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

/**
 * Per order `o`: its refunds and returns recorded up to the period's end (for a sale of the
 * period) and within the period (for an earlier sale), and its commissions, which stay with the
 * sale.
 */
function orderAdjustmentsLateral(range: ReportRange): SQL {
  const from = timestampOf(range.from);
  const to = timestampOf(range.to);
  const inPeriod = sql`a.created_at >= ${from} and a.created_at < ${to}`;
  return sql`
  left join lateral (
    select
      sum(a.amount_cents) filter (where a.type = 'refund' and a.created_at < ${to}) as refunds_by_end,
      sum(a.amount_cents) filter (where a.type = 'refund' and ${inPeriod}) as refunds_in_period,
      sum(a.amount_cents) filter (where a.type = 'return' and a.created_at < ${to}) as returns_by_end,
      sum(a.amount_cents) filter (where a.type = 'return' and ${inPeriod}) as returns_in_period,
      sum(a.amount_cents) filter (where a.type = 'commission') as commissions,
      min(a.created_at) filter (where a.type in ('refund', 'return') and ${inPeriod})
        as first_in_period
    from order_adjustments a
    where a.order_id = o.id and a.tenant_id = o.tenant_id
  ) adj on true`;
}

/** The SQL pieces that place an order `o` in a period: a sale of it, or an earlier one. */
interface PeriodPlacement {
  /** Sold (or placed, if never paid) before the period: here only for what happened in it. */
  earlier: SQL;
  /** A sale of the period that still counted when the period ended. */
  counted: SQL;
  /** An earlier sale undone in the period: it comes back as a negative row. */
  undoneHere: SQL;
}

function periodPlacement(range: ReportRange): PeriodPlacement {
  const from = timestampOf(range.from);
  const to = timestampOf(range.to);
  const earlier = sql`(${ORDER_SALE_DATE} < ${from})`;
  return {
    earlier,
    counted: sql`(not ${earlier} and (${isCountedOrder(ORDER_STATUS)}
      or coalesce(o.reversed_at >= ${to}, false)))`,
    undoneHere: sql`(${earlier} and ${isUncountedOrder(ORDER_STATUS)}
      and coalesce(o.reversed_at >= ${from} and o.reversed_at < ${to}, false))`,
  };
}

/**
 * Orders `o` the period's numbers read: those filed in it, and earlier sales undone, refunded
 * or returned in it.
 */
function inPeriodCondition(scope: ReportScope): SQL {
  const from = timestampOf(scope.range.from);
  const to = timestampOf(scope.range.to);
  return sql`(
    (${ORDER_SALE_DATE} >= ${from} and ${ORDER_SALE_DATE} < ${to})
    or (${ORDER_SALE_DATE} < ${from} and o.id in (
      select r.id from orders r
      where r.tenant_id = ${scope.tenantId} and r.reversed_at >= ${from} and r.reversed_at < ${to}
        and ${isUncountedOrder(sql.raw("r.status"))}
      union
      select ra.order_id from order_adjustments ra
      where ra.tenant_id = ${scope.tenantId} and ra.type in ('refund', 'return')
        and ra.created_at >= ${from} and ra.created_at < ${to}
    ))
  )`;
}

/**
 * The money columns of an order `o` in the period: a sale of it counts (sign 1), an earlier sale
 * undone in it is taken back (sign -1), anything else adds nothing but its refunds and returns.
 */
function orderMoneyColumns(placement: PeriodPlacement): SQL {
  const { earlier, counted, undoneHere } = placement;
  const unknownCost = sql`coalesce(items.unknown_cost, false)`;
  const sign = sql`(case when ${counted} then 1 when ${undoneHere} then -1 else 0 end)`;
  const costPending = sql`((${counted} or ${undoneHere}) and ${unknownCost})`;
  // The adjustments of a sale of unknown cost stay out of the profit, as its cost does.
  const adjustmentsOut = sql`(${unknownCost} and (${counted} or ${earlier}))`;
  return sql`
        ${costPending} as cost_pending,
        ${sign} * o.total_cents as revenue,
        case when ${costPending} then ${sign} * o.total_cents else 0 end as pending_revenue,
        case when ${costPending} then 0 else ${sign} * coalesce(items.cost, 0) end as cost,
        case when ${costPending} then 0
          else ${sign} * (o.marketplace_fee_cents::bigint + ${sellerShippingOnce("o")}) end as fee,
        case when ${adjustmentsOut} then 0
          when ${earlier} then coalesce(adj.refunds_in_period, 0)
          else coalesce(adj.refunds_by_end, 0) end as refunds,
        case when ${adjustmentsOut} then 0
          when ${earlier} then coalesce(adj.returns_in_period, 0)
          else coalesce(adj.returns_by_end, 0) end as returns,
        case when ${adjustmentsOut} or ${earlier} then 0
          else coalesce(adj.commissions, 0) end as commissions`;
}

/** CTE with one row per order the period reads, already with its finances in the period. */
function orderFinanceCte(scope: ReportScope, extraConditions: SQL[] = []): SQL {
  const conditions: SQL[] = [
    sql`o.tenant_id = ${scope.tenantId}`,
    inPeriodCondition(scope),
    ...extraConditions,
  ];
  if (scope.storeConnectionId) {
    conditions.push(sql`o.store_connection_id = ${scope.storeConnectionId}`);
  }
  const where = sql.join(conditions, sql` and `);
  const placement = periodPlacement(scope.range);
  const { earlier, counted, undoneHere } = placement;
  return sql`
    order_finance as (
      select
        o.id,
        o.external_order_id,
        o.status,
        o.ordered_at,
        o.paid_at,
        o.reversed_at,
        ${ORDER_SALE_DATE} as sale_date,
        case when ${earlier}
          then coalesce(case when ${undoneHere} then o.reversed_at end, adj.first_in_period)
          else ${ORDER_SALE_DATE} end as entry_date,
        ${earlier} as earlier,
        ${undoneHere} as undone_here,
        o.delivered_at,
        o.buyer_name,
        o.store_connection_id,
        s.shop_name,
        o.total_cents,
        ${counted} as counted,
        ${orderMoneyColumns(placement)},
        coalesce(items.titles, '') as item_titles
      from orders o
      join store_connections s on s.id = o.store_connection_id and s.tenant_id = o.tenant_id
      ${ORDER_ITEMS_LATERAL}
      ${orderAdjustmentsLateral(scope.range)}
      where ${where}
    ),
    order_profit as (
      select
        f.*,
        f.revenue - f.pending_revenue - f.cost - f.fee - f.refunds + f.commissions as profit
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
  profit: cents,
  pending_orders: count,
  pending_revenue: cents,
  unpaid_orders: count,
  unpaid_total: cents,
  sales_revenue: cents,
  reversed_earlier_orders: count,
  reversed_earlier_revenue: cents,
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
  profitCents: number;
  /** Sales with an item of unknown cost: in the revenue, out of the profit. */
  pendingCostOrders: number;
  pendingCostRevenueCents: number;
  /** Orders of the period still awaiting payment, and their total: not sales (yet). */
  unpaidOrders: number;
  unpaidTotalCents: number;
  averageTicketCents: number | null;
  /**
   * Sales of an earlier period cancelled or returned in this one, and the revenue they had
   * (a positive number): already taken off this period's revenue and profit.
   */
  reversedEarlierOrders: number;
  reversedEarlierRevenueCents: number;
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
      -- A sale undone only after the period ended still counts in it; one undone within the
      -- period, or before it was ever paid, is a cancellation of the period.
      count(*) filter (where not earlier and not counted and status in ('cancelled', 'returned'))
        as cancelled,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(cost), 0) as cost,
      coalesce(sum(fee), 0) as fees,
      coalesce(sum(refunds), 0) as refunds,
      coalesce(sum(returns), 0) as returns,
      coalesce(sum(commissions), 0) as commissions,
      coalesce(sum(profit), 0) as profit,
      count(*) filter (where cost_pending and counted) as pending_orders,
      coalesce(sum(pending_revenue), 0) as pending_revenue,
      count(*) filter (where not earlier and status = 'pending') as unpaid_orders,
      coalesce(sum(total_cents) filter (where not earlier and status = 'pending'), 0)
        as unpaid_total,
      coalesce(sum(revenue) filter (where counted), 0) as sales_revenue,
      count(*) filter (where undone_here) as reversed_earlier_orders,
      coalesce(-sum(revenue) filter (where undone_here), 0) as reversed_earlier_revenue
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
    profitCents: row.profit,
    pendingCostOrders: row.pending_orders,
    pendingCostRevenueCents: row.pending_revenue,
    unpaidOrders: row.unpaid_orders,
    unpaidTotalCents: row.unpaid_total,
    averageTicketCents: row.orders > 0 ? Math.round(row.sales_revenue / row.orders) : null,
    reversedEarlierOrders: row.reversed_earlier_orders,
    reversedEarlierRevenueCents: row.reversed_earlier_revenue,
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
        date_trunc(${unit}, entry_date at time zone ${REPORT_TIME_ZONE}) as bucket,
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
  /** The store's marketplace, for its logo ("mercado_livre", "shopee", ...). */
  marketplace: string;
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
      f.store_connection_id,
      f.shop_name,
      s.marketplace,
      count(*) filter (where f.counted) as orders,
      coalesce(sum(f.revenue), 0) as revenue,
      coalesce(sum(f.profit), 0) as profit,
      coalesce(sum(f.pending_revenue), 0) as pending_revenue
    from order_profit f
    join store_connections s on s.id = f.store_connection_id and s.tenant_id = ${scope.tenantId}
    group by f.store_connection_id, f.shop_name, s.marketplace
    order by revenue desc, f.shop_name asc
  `);
  return z
    .array(
      z.object({
        store_connection_id: z.string(),
        shop_name: z.string(),
        marketplace: z.string(),
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
      marketplace: row.marketplace,
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
  /** First photo of the catalog product sold under this title, when it has one. */
  imageUrl: string | null;
  categoryName: string | null;
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
      sum(i.unit_price_cents::bigint * i.quantity) as revenue,
      (array_agg(p.image_urls[1] order by f.sale_date desc)
        filter (where p.image_urls[1] is not null))[1] as image_url,
      (array_agg(c.name order by f.sale_date desc) filter (where c.name is not null))[1]
        as category_name
    from order_profit f
    join order_items i on i.order_id = f.id and i.tenant_id = ${scope.tenantId}
    left join supplier_products p on p.id = i.supplier_product_id
    left join categories c on c.id = p.category_id
    where f.counted
    group by i.title
    order by revenue desc, i.title asc
    limit ${limit}
  `);
  return z
    .array(
      z.object({
        title: z.string(),
        units: count,
        revenue: cents,
        image_url: z.string().nullable(),
        category_name: z.string().nullable(),
      }),
    )
    .parse([...rows])
    .map((row) => ({
      title: row.title,
      units: row.units,
      revenueCents: row.revenue,
      imageUrl: row.image_url,
      categoryName: row.category_name,
    }));
}

const FINANCIAL_SORT_FIELDS = ["orderedAt", "revenue", "profit", "status"] as const;
export type FinancialSortField = (typeof FINANCIAL_SORT_FIELDS)[number];

const FINANCIAL_SORT_SQL: Record<FinancialSortField, SQL> = {
  // The URL keeps "orderedAt"; the list is in the order its totals count: by the date each row
  // counts in the period (the sale, or the cancellation or refund of an earlier sale).
  orderedAt: sql.raw("entry_date"),
  revenue: sql.raw("revenue"),
  profit: sql.raw("profit"),
  status: sql.raw("status"),
};

export interface FinancialFilters {
  statuses?: readonly string[] | undefined;
  search?: string | undefined;
  /**
   * Only orders filed in the period, without the earlier sales cancelled or refunded in it: an
   * order list by date (the public API) shows each order once.
   */
  filedInPeriodOnly?: boolean | undefined;
}

export interface FinancialSort {
  field: FinancialSortField;
  direction: "asc" | "desc";
}

export interface OrderFinancialRow {
  id: string;
  externalOrderId: string;
  orderedAt: Date;
  /** When the order first counted as a sale; null while it never did. */
  paidAt: Date | null;
  /** When a paid sale was cancelled or returned; null while it never was. */
  reversedAt: Date | null;
  /** When this row counts in the period: the sale, or what happened in it to an earlier sale. */
  entryDate: Date;
  /**
   * A sale of an earlier period that this period only shows for what happened in it: its
   * cancellation or return (negative amounts) or a refund.
   */
  fromEarlierPeriod: boolean;
  /**
   * Counts as a sale in the period: paid in it and not cancelled or returned before it ended
   * (one undone later still counts here).
   */
  countsAsSale: boolean;
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
  paid_at: z.coerce.date().nullable(),
  reversed_at: z.coerce.date().nullable(),
  entry_date: z.coerce.date(),
  earlier: z.boolean(),
  counted: z.boolean(),
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
    paidAt: row.paid_at,
    reversedAt: row.reversed_at,
    entryDate: row.entry_date,
    fromEarlierPeriod: row.earlier,
    countsAsSale: row.counted,
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

function financialConditions(scope: ReportScope, filters: FinancialFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.filedInPeriodOnly === true) {
    conditions.push(sql`${ORDER_SALE_DATE} >= ${timestampOf(scope.range.from)}`);
  }
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
  return sql`order by ${FINANCIAL_SORT_SQL[sort.field]} ${direction}, entry_date desc, id`;
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
  const cte = orderFinanceCte(scope, financialConditions(scope, filters));
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
    with ${orderFinanceCte(scope, financialConditions(scope, filters))}
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
