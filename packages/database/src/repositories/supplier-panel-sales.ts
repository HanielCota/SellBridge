import type { OrderStatus } from "@sellbridge/shared/schemas";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import type { ReportRange } from "./reports.ts";
import { sqlIntegerSchema, timestampOf } from "./sql/raw-values.ts";
import { BUCKET_SQL, type TimeseriesBucket } from "./sql/timeseries-buckets.ts";

/**
 * Sales of one supplier's products, across every reseller (item 38). The supplier sees what it
 * receives (`unit_cost_cents × quantity`), never the reseller's sale price or name: resellers are
 * only counted.
 */

export interface SupplierSalesScope {
  supplierId: string;
  range: ReportRange;
  /** Order statuses that count, from `SUPPLIER_SALES_SITUATION_STATUSES`; never empty. */
  statuses: readonly OrderStatus[];
  supplierProductId?: string | undefined;
}

const count = sqlIntegerSchema;

function statusList(statuses: readonly OrderStatus[]): SQL {
  return sql.join(
    statuses.map((status) => sql`${status}`),
    sql`, `,
  );
}

/**
 * CTE `supplier_lines`: one row per sold item of the supplier's products in the scope. The status
 * is compared as text, since the parameters reach Postgres untyped.
 */
export function supplierLinesCte(scope: SupplierSalesScope): SQL {
  const conditions: SQL[] = [
    sql`p.supplier_id = ${scope.supplierId}`,
    sql`o.ordered_at >= ${timestampOf(scope.range.from)}`,
    sql`o.ordered_at < ${timestampOf(scope.range.to)}`,
    sql`o.status::text in (${statusList(scope.statuses)})`,
  ];
  if (scope.supplierProductId !== undefined) {
    conditions.push(sql`i.supplier_product_id = ${scope.supplierProductId}`);
  }
  return sql`
    supplier_lines as (
      select
        o.id as order_id,
        o.tenant_id,
        o.ordered_at,
        i.supplier_product_id,
        i.quantity,
        i.unit_cost_cents::bigint * i.quantity as receivable
      from order_items i
      join supplier_products p on p.id = i.supplier_product_id
      join orders o on o.id = i.order_id and o.tenant_id = i.tenant_id
      where ${sql.join(conditions, sql` and `)}
    )`;
}

export interface SupplierSalesSummary {
  orders: number;
  units: number;
  receivableCents: number;
  /** Resellers (accounts) with at least one of these orders. */
  resellers: number;
  averageOrderCents: number | null;
}

const summaryRowSchema = z.object({
  orders: count,
  units: count,
  receivable: count,
  resellers: count,
});

export async function getSupplierSalesSummary(
  database: Database,
  scope: SupplierSalesScope,
): Promise<SupplierSalesSummary> {
  const rows = await database.execute(sql`
    with ${supplierLinesCte(scope)}
    select
      count(distinct order_id) as orders,
      coalesce(sum(quantity), 0) as units,
      coalesce(sum(receivable), 0) as receivable,
      count(distinct tenant_id) as resellers
    from supplier_lines
  `);
  const row = summaryRowSchema.parse(rows[0]);
  return {
    orders: row.orders,
    units: row.units,
    receivableCents: row.receivable,
    resellers: row.resellers,
    averageOrderCents: row.orders > 0 ? Math.round(row.receivable / row.orders) : null,
  };
}

export interface SupplierSalesPoint {
  date: string;
  orders: number;
  units: number;
  receivableCents: number;
}

const pointRowSchema = z.object({
  bucket: z.string(),
  orders: count,
  units: count,
  receivable: count,
});

/** Orders, units and amount per hour, day, week or month (Brazil time), empty buckets at zero. */
export async function getSupplierSalesTimeseries(
  database: Database,
  scope: SupplierSalesScope,
  bucket: TimeseriesBucket,
): Promise<SupplierSalesPoint[]> {
  const { unit, step, label } = BUCKET_SQL[bucket];
  const rows = await database.execute(sql`
    with ${supplierLinesCte(scope)},
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
        count(distinct order_id) as orders,
        sum(quantity) as units,
        sum(receivable) as receivable
      from supplier_lines
      group by 1
    )
    select
      to_char(b.bucket, ${label}) as bucket,
      coalesce(g.orders, 0) as orders,
      coalesce(g.units, 0) as units,
      coalesce(g.receivable, 0) as receivable
    from buckets b
    left join grouped g on g.bucket = b.bucket
    order by b.bucket
  `);
  return z
    .array(pointRowSchema)
    .parse([...rows])
    .map((row) => ({
      date: row.bucket,
      orders: row.orders,
      units: row.units,
      receivableCents: row.receivable,
    }));
}

const stageRowSchema = z.object({ status: z.string(), parcels: count });

/** Parcels still on their way: counted whenever their order was placed, as the queue does. */
const OPEN_PARCEL_STATUSES = sql.raw("('forwarded', 'accepted', 'picking', 'ready', 'shipped')");

/**
 * The supplier's parcels per fulfillment status, for "Seus pedidos": every parcel still open
 * (the same ones Pedidos and "Precisa de você" count), and the settled ones of orders placed in
 * the range. A product filter keeps the parcels of orders that have that product.
 */
export async function countSupplierParcelsByStatus(
  database: Database,
  scope: Omit<SupplierSalesScope, "statuses">,
): Promise<{ status: string; parcels: number }[]> {
  const conditions: SQL[] = [
    sql`s.supplier_id = ${scope.supplierId}`,
    sql`(s.status in ${OPEN_PARCEL_STATUSES} or (
      o.ordered_at >= ${timestampOf(scope.range.from)}
      and o.ordered_at < ${timestampOf(scope.range.to)}
    ))`,
  ];
  if (scope.supplierProductId !== undefined) {
    conditions.push(sql`exists (
      select 1 from order_items i
      join supplier_products p on p.id = i.supplier_product_id
      where i.order_id = o.id and i.tenant_id = o.tenant_id
        and p.supplier_id = s.supplier_id
        and i.supplier_product_id = ${scope.supplierProductId}
    )`);
  }
  const rows = await database.execute(sql`
    select s.status, count(*) as parcels
    from order_shipments s
    join orders o on o.id = s.order_id and o.tenant_id = s.tenant_id
    where ${sql.join(conditions, sql` and `)}
    group by s.status
  `);
  return z.array(stageRowSchema).parse([...rows]);
}
