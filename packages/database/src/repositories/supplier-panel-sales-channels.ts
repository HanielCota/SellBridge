import type { OrderStatus } from "@sellbridge/shared/schemas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { sqlIntegerSchema, timestampOf } from "./sql/raw-values.ts";
import { supplierLinesCte, type SupplierSalesScope } from "./supplier-panel-sales.ts";

/**
 * The "Vendas" page's two extra reads: where the supplier's products sold (marketplace, never
 * the reseller's shop name) and the products that stopped selling.
 */

const count = sqlIntegerSchema;

export interface SupplierMarketplaceSales {
  marketplace: string;
  orders: number;
  receivableCents: number;
}

const marketplaceRowSchema = z.object({
  marketplace: z.string(),
  orders: count,
  receivable: count,
});

/** Orders and what the supplier receives per marketplace, most orders first. */
export async function listSupplierSalesByMarketplace(
  database: Database,
  scope: SupplierSalesScope,
): Promise<SupplierMarketplaceSales[]> {
  const rows = await database.execute(sql`
    with ${supplierLinesCte(scope)}
    select
      s.marketplace::text as marketplace,
      count(distinct l.order_id) as orders,
      coalesce(sum(l.receivable), 0) as receivable
    from supplier_lines l
    join orders o on o.id = l.order_id
    join store_connections s on s.id = o.store_connection_id
    group by s.marketplace
    order by orders desc, marketplace asc
  `);
  return z
    .array(marketplaceRowSchema)
    .parse([...rows])
    .map((row) => ({
      marketplace: row.marketplace,
      orders: row.orders,
      receivableCents: row.receivable,
    }));
}

/** Shops (store connections) with at least one order of the supplier in the scope. */
export async function countSupplierSellingStores(
  database: Database,
  scope: SupplierSalesScope,
): Promise<number> {
  const rows = await database.execute(sql`
    with ${supplierLinesCte(scope)}
    select count(distinct o.store_connection_id) as stores
    from supplier_lines l
    join orders o on o.id = l.order_id
  `);
  return z.object({ stores: count }).parse(rows[0]).stores;
}

export interface SupplierIdleProduct {
  productId: string;
  title: string;
  sku: string;
  imageUrl: string | null;
  availableStock: number;
}

const idleRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  sku: z.string(),
  image_url: z.string().nullable(),
  available: count,
});

/**
 * Active, approved products with stock to sell and no sale since `since`, the most stock first:
 * what is sitting on the shelf.
 */
export async function listSupplierIdleProducts(
  database: Database,
  input: { supplierId: string; since: Date; statuses: readonly OrderStatus[]; limit: number },
): Promise<SupplierIdleProduct[]> {
  const statuses = sql.join(
    input.statuses.map((status) => sql`${status}`),
    sql`, `,
  );
  const rows = await database.execute(sql`
    select
      p.id,
      p.title,
      p.sku,
      p.image_urls[1] as image_url,
      p.stock - p.reserved_stock as available
    from supplier_products p
    where p.supplier_id = ${input.supplierId}
      and p.active
      and p.review_status = 'approved'
      and p.stock - p.reserved_stock > 0
      and not exists (
        select 1 from order_items i
        join orders o on o.id = i.order_id and o.tenant_id = i.tenant_id
        where i.supplier_product_id = p.id
          and o.ordered_at >= ${timestampOf(input.since)}
          and o.status::text in (${statuses})
      )
    order by available desc, p.title asc
    limit ${input.limit}
  `);
  return z
    .array(idleRowSchema)
    .parse([...rows])
    .map((row) => ({
      productId: row.id,
      title: row.title,
      sku: row.sku,
      imageUrl: row.image_url,
      availableStock: row.available,
    }));
}
