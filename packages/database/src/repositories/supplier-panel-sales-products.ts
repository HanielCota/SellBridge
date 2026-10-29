import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { supplierLinesCte, type SupplierSalesScope } from "./supplier-panel-sales.ts";
import { sqlIntegerSchema } from "./sql/raw-values.ts";
import { BUCKET_SQL, type TimeseriesBucket } from "./sql/timeseries-buckets.ts";

/** Per-product sales of the supplier home: the best sellers and their pace over the period. */

const count = sqlIntegerSchema;

export interface SupplierProductSales {
  productId: string;
  title: string;
  sku: string;
  imageUrl: string | null;
  /** Sellable now: stock minus the units held by paid orders not yet shipped. */
  availableStock: number;
  units: number;
  receivableCents: number;
}

const productRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  sku: z.string(),
  image_url: z.string().nullable(),
  available: count,
  units: count,
  receivable: count,
});

/** Products that sold in the scope; apply the stock filter and ranking before limiting rows. */
export async function listSupplierProductSales(
  database: Database,
  scope: SupplierSalesScope,
  limit: number,
  options: { sortBy?: "units" | "value"; soldOutOnly?: boolean } = {},
): Promise<SupplierProductSales[]> {
  const ranking = options.sortBy === "value" ? sql`sold.receivable` : sql`sold.units`;
  const rows = await database.execute(sql`
    with ${supplierLinesCte(scope)},
    sold as (
      select supplier_product_id, sum(quantity) as units, sum(receivable) as receivable
      from supplier_lines
      group by supplier_product_id
    )
    select
      p.id,
      p.title,
      p.sku,
      p.image_urls[1] as image_url,
      p.stock - p.reserved_stock as available,
      sold.units,
      sold.receivable
    from sold
    join supplier_products p on p.id = sold.supplier_product_id
    where ${options.soldOutOnly === true ? sql`p.stock - p.reserved_stock <= 0` : sql`true`}
    order by ${ranking} desc, p.title asc, p.id asc
    limit ${limit}
  `);
  return z
    .array(productRowSchema)
    .parse([...rows])
    .map((row) => ({
      productId: row.id,
      title: row.title,
      sku: row.sku,
      imageUrl: row.image_url,
      availableStock: row.available,
      units: row.units,
      receivableCents: row.receivable,
    }));
}

export interface SupplierProductPoint {
  date: string;
  productId: string;
  units: number;
  receivableCents: number;
}

const productPointRowSchema = z.object({
  bucket: z.string(),
  product_id: z.string(),
  units: count,
  receivable: count,
});

/**
 * Units and amount of each of `productIds` per bucket, for the "Por produto" chart. Only buckets
 * with sales come back; the chart lays them over the dates of the main series.
 */
export async function getSupplierProductTimeseries(
  database: Database,
  scope: SupplierSalesScope,
  input: { bucket: TimeseriesBucket; productIds: readonly string[] },
): Promise<SupplierProductPoint[]> {
  if (input.productIds.length === 0) {
    return [];
  }
  const { unit, label } = BUCKET_SQL[input.bucket];
  const ids = sql.join(
    input.productIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await database.execute(sql`
    with ${supplierLinesCte(scope)}
    select
      to_char(date_trunc(${unit}, ordered_at at time zone ${REPORT_TIME_ZONE}), ${label}) as bucket,
      supplier_product_id as product_id,
      sum(quantity) as units,
      sum(receivable) as receivable
    from supplier_lines
    where supplier_product_id::text in (${ids})
    group by 1, 2
    order by 1, 2
  `);
  return z
    .array(productPointRowSchema)
    .parse([...rows])
    .map((row) => ({
      date: row.bucket,
      productId: row.product_id,
      units: row.units,
      receivableCents: row.receivable,
    }));
}

/** Most products a supplier home lists in its product filter. */
const PRODUCT_OPTIONS_LIMIT = 500;

/** The supplier's products by name, for the chart's product filter. */
export async function listSupplierProductOptions(
  database: Database,
  supplierId: string,
): Promise<{ id: string; title: string }[]> {
  const rows = await database.execute(sql`
    select p.id, p.title
    from supplier_products p
    where p.supplier_id = ${supplierId}
    order by p.title asc, p.id asc
    limit ${PRODUCT_OPTIONS_LIMIT}
  `);
  return z.array(z.object({ id: z.string(), title: z.string() })).parse([...rows]);
}

/** Where a new supplier stands, for the home's first steps (item 38). */
export interface SupplierSetupState {
  /** Products in the catalog, at any review status. */
  products: number;
  /** Sent for review or already approved: the second step is done. */
  submitted: number;
  approved: number;
  /**
   * Any paid order of the supplier's products ever. A cancelled one counts only when its history
   * shows it was paid first: an order cancelled unpaid was never a sale.
   */
  hasSales: boolean;
}

const setupRowSchema = z.object({
  products: count,
  submitted: count,
  approved: count,
  has_sales: z.boolean(),
});

export async function getSupplierSetupState(
  database: Database,
  supplierId: string,
): Promise<SupplierSetupState> {
  const rows = await database.execute(sql`
    select
      count(*) as products,
      count(*) filter (where p.review_status <> 'draft') as submitted,
      count(*) filter (where p.review_status = 'approved') as approved,
      exists (
        select 1 from order_items i
        join supplier_products sold on sold.id = i.supplier_product_id
        join orders o on o.id = i.order_id and o.tenant_id = i.tenant_id
        where sold.supplier_id = ${supplierId}
          and (
            o.status in ('paid', 'shipped', 'delivered', 'returned')
            or (o.status = 'cancelled' and exists (
              select 1 from order_status_changes c
              where c.order_id = o.id and c.tenant_id = o.tenant_id
                and c.status in ('paid', 'shipped', 'delivered')
            ))
          )
      ) as has_sales
    from supplier_products p
    where p.supplier_id = ${supplierId}
  `);
  const row = setupRowSchema.parse(rows[0]);
  return {
    products: row.products,
    submitted: row.submitted,
    approved: row.approved,
    hasSales: row.has_sales,
  };
}
