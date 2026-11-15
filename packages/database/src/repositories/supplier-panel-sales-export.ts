import { validationError } from "@sellbridge/shared/errors";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { supplierLinesCte, type SupplierSalesScope } from "./supplier-panel-sales.ts";
import { sqlIntegerSchema } from "./sql/raw-values.ts";

/** Most item lines one supplier export holds; a longer period is split by the supplier. */
export const SUPPLIER_EXPORT_LIMIT = 10_000;

/**
 * One sold item of the supplier's spreadsheet. It carries what the supplier receives, never the
 * reseller's store, buyer or sale price (item 38: privacy of the reseller).
 */
export interface SupplierSaleLine {
  orderedAt: Date;
  /** When the order first counted as a sale; null while it never did. */
  paidAt: Date | null;
  externalOrderId: string;
  status: string;
  title: string;
  sku: string;
  quantity: number;
  receivableCents: number;
}

const lineRowSchema = z.object({
  ordered_at: z.coerce.date(),
  paid_at: z.coerce.date().nullable(),
  external_order_id: z.string(),
  status: z.string(),
  title: z.string(),
  sku: z.string(),
  quantity: sqlIntegerSchema,
  receivable: sqlIntegerSchema,
});

/** Every sold item of the scope, oldest sale first; refuses a period above `SUPPLIER_EXPORT_LIMIT`. */
export async function exportSupplierSaleLines(
  database: Database,
  scope: SupplierSalesScope,
): Promise<SupplierSaleLine[]> {
  const rows = await database.execute(sql`
    with ${supplierLinesCte(scope)}
    select
      l.ordered_at,
      l.paid_at,
      o.external_order_id,
      o.status,
      p.title,
      p.sku,
      l.quantity,
      l.receivable
    from supplier_lines l
    join orders o on o.id = l.order_id
    join supplier_products p on p.id = l.supplier_product_id
    order by l.sale_date asc, o.external_order_id asc, p.title asc
    limit ${SUPPLIER_EXPORT_LIMIT + 1}
  `);
  if (rows.length > SUPPLIER_EXPORT_LIMIT) {
    throw validationError(
      `O período tem mais de ${SUPPLIER_EXPORT_LIMIT.toLocaleString("pt-BR")} itens vendidos. Escolha um período menor para exportar.`,
    );
  }
  return z
    .array(lineRowSchema)
    .parse([...rows])
    .map((row) => ({
      orderedAt: row.ordered_at,
      paidAt: row.paid_at,
      externalOrderId: row.external_order_id,
      status: row.status,
      title: row.title,
      sku: row.sku,
      quantity: row.quantity,
      receivableCents: row.receivable,
    }));
}
