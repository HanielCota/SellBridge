import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  erpStockRefreshRequests,
  supplierErpConnections,
  supplierProducts,
} from "../schema/index.ts";

/**
 * A supplier whose stock follows its Bling account: any connected one. SellBridge's own sales
 * lower Bling's stock through the NF-e sale order or, without it, through the stock exit the
 * worker posts.
 */
const followsErpStock = and(
  eq(supplierErpConnections.provider, "bling"),
  eq(supplierErpConnections.status, "connected"),
);

export interface ErpStockAccount {
  readonly supplierId: string;
  readonly connectionId: string;
  readonly erpCompanyId: string | null;
  readonly stockCheckFailures: number;
  readonly stockCheckedAt: Date | null;
  readonly lastStockNoticeAt: Date | null;
}

const accountColumns = {
  supplierId: supplierErpConnections.supplierId,
  connectionId: supplierErpConnections.id,
  erpCompanyId: supplierErpConnections.erpCompanyId,
  stockCheckFailures: supplierErpConnections.stockCheckFailures,
  stockCheckedAt: supplierErpConnections.stockCheckedAt,
  lastStockNoticeAt: supplierErpConnections.lastStockNoticeAt,
};

/** Every account whose stock follows Bling, for the periodic check. */
export async function listErpStockAccounts(database: Database): Promise<ErpStockAccount[]> {
  return database
    .select(accountColumns)
    .from(supplierErpConnections)
    .where(followsErpStock)
    .orderBy(asc(supplierErpConnections.supplierId));
}

/** The supplier's account when its stock follows Bling, else null (disconnected or not opted in). */
export async function findErpStockAccount(
  database: Database,
  supplierId: string,
): Promise<ErpStockAccount | null> {
  const [row] = await database
    .select(accountColumns)
    .from(supplierErpConnections)
    .where(and(followsErpStock, eq(supplierErpConnections.supplierId, supplierId)));
  return row ?? null;
}

/** The suppliers whose stock follows this Bling company (a notification names only the company). */
export async function findErpStockSuppliersByCompany(
  database: Database,
  companyId: string,
): Promise<string[]> {
  const rows = await database
    .select({ supplierId: supplierErpConnections.supplierId })
    .from(supplierErpConnections)
    .where(and(followsErpStock, eq(supplierErpConnections.erpCompanyId, companyId)));
  return rows.map((row) => row.supplierId);
}

export async function saveErpCompanyId(
  database: Database,
  input: { connectionId: string; erpCompanyId: string },
): Promise<void> {
  await database
    .update(supplierErpConnections)
    .set({ erpCompanyId: input.erpCompanyId })
    .where(eq(supplierErpConnections.id, input.connectionId));
}

/**
 * Stores what a stock notification asks for: one pending read per product (a repeat only moves
 * `requestedAt`), and when the account last heard from Bling.
 */
export async function recordErpStockNotice(
  database: Database,
  input: { supplierIds: readonly string[]; erpProductIds: readonly number[]; receivedAt: Date },
): Promise<void> {
  if (input.supplierIds.length === 0) {
    return;
  }
  const rows = input.supplierIds.flatMap((supplierId) =>
    input.erpProductIds.map((erpProductId) => ({
      supplierId,
      erpProductId,
      requestedAt: input.receivedAt,
    })),
  );
  await database.transaction(async (transaction) => {
    if (rows.length > 0) {
      await transaction
        .insert(erpStockRefreshRequests)
        .values(rows)
        .onConflictDoUpdate({
          target: [erpStockRefreshRequests.supplierId, erpStockRefreshRequests.erpProductId],
          set: { requestedAt: input.receivedAt },
        });
    }
    await transaction
      .update(supplierErpConnections)
      .set({ lastStockNoticeAt: input.receivedAt })
      .where(
        and(
          eq(supplierErpConnections.provider, "bling"),
          inArray(supplierErpConnections.supplierId, [...input.supplierIds]),
        ),
      );
  });
}

/** Takes up to `limit` of the supplier's pending reads; the caller reads their balance now. */
export async function claimErpStockRefreshRequests(
  database: Database,
  input: { supplierId: string; limit: number },
): Promise<number[]> {
  const rows = await database.execute<{ erp_product_id: string | number }>(sql`
    delete from ${erpStockRefreshRequests}
    where ${erpStockRefreshRequests.supplierId} = ${input.supplierId}
      and ${erpStockRefreshRequests.erpProductId} in (
        select ${erpStockRefreshRequests.erpProductId} from ${erpStockRefreshRequests}
        where ${erpStockRefreshRequests.supplierId} = ${input.supplierId}
        order by ${erpStockRefreshRequests.requestedAt}
        limit ${input.limit}
      )
    returning ${erpStockRefreshRequests.erpProductId}
  `);
  return rows.map((row) => Number(row.erp_product_id));
}

/** The pending reads a full check already covered (asked before the check started). */
export async function deleteErpStockRefreshRequestsBefore(
  database: Database,
  input: { supplierId: string; before: Date },
): Promise<void> {
  await database
    .delete(erpStockRefreshRequests)
    .where(
      and(
        eq(erpStockRefreshRequests.supplierId, input.supplierId),
        lte(erpStockRefreshRequests.requestedAt, input.before),
      ),
    );
}

/** A page of the supplier's SKUs not yet found in Bling, after `afterSku` (SKU order). */
export async function listUnlinkedErpSkus(
  database: Database,
  input: { supplierId: string; afterSku: string | null; limit: number },
): Promise<string[]> {
  const conditions = [
    eq(supplierProducts.supplierId, input.supplierId),
    isNull(supplierProducts.erpProductId),
  ];
  if (input.afterSku !== null) {
    conditions.push(gt(supplierProducts.sku, input.afterSku));
  }
  const rows = await database
    .select({ sku: supplierProducts.sku })
    .from(supplierProducts)
    .where(and(...conditions))
    .orderBy(asc(supplierProducts.sku))
    .limit(input.limit);
  return rows.map((row) => row.sku);
}

/** A page of the supplier's linked Bling ids, after `afterId` (id order). */
export async function listLinkedErpProductIds(
  database: Database,
  input: { supplierId: string; afterId: number | null; limit: number },
): Promise<number[]> {
  const conditions = [
    eq(supplierProducts.supplierId, input.supplierId),
    isNotNull(supplierProducts.erpProductId),
  ];
  if (input.afterId !== null) {
    conditions.push(gt(supplierProducts.erpProductId, input.afterId));
  }
  const rows = await database
    .select({ erpProductId: supplierProducts.erpProductId })
    .from(supplierProducts)
    .where(and(...conditions))
    .orderBy(asc(supplierProducts.erpProductId))
    .limit(input.limit);
  return rows.flatMap((row) => (row.erpProductId === null ? [] : [row.erpProductId]));
}

/** Links the supplier's products to the Bling ids found for their SKUs; linked ones stay as they are. */
export async function linkErpProducts(
  database: Database,
  input: { supplierId: string; links: readonly { sku: string; erpProductId: number }[] },
): Promise<number> {
  if (input.links.length === 0) {
    return 0;
  }
  const values = sql.join(
    input.links.map((link) => sql`(${link.sku}::text, ${link.erpProductId}::bigint)`),
    sql`, `,
  );
  const rows = await database.execute<{ id: string }>(sql`
    update supplier_products as product
    set erp_product_id = link.erp_product_id
    from (values ${values}) as link(sku, erp_product_id)
    where product.supplier_id = ${input.supplierId}
      and product.sku = link.sku
      and product.erp_product_id is null
    returning product.id
  `);
  return rows.length;
}

/** Forgets Bling ids that Bling no longer has; the product's stock stops following Bling. */
export async function unlinkErpProducts(
  database: Database,
  input: { supplierId: string; erpProductIds: readonly number[] },
): Promise<void> {
  if (input.erpProductIds.length === 0) {
    return;
  }
  await database
    .update(supplierProducts)
    .set({ erpProductId: null, erpStockReadAt: null })
    .where(
      and(
        eq(supplierProducts.supplierId, input.supplierId),
        inArray(supplierProducts.erpProductId, [...input.erpProductIds]),
      ),
    );
}

/**
 * Forgets every Bling id of the supplier: the account now connected is another Bling company,
 * whose ids mean other products. The next check links them again by SKU.
 */
export async function unlinkAllErpProducts(database: Database, supplierId: string): Promise<void> {
  await database
    .update(supplierProducts)
    .set({ erpProductId: null, erpStockReadAt: null })
    .where(
      and(eq(supplierProducts.supplierId, supplierId), isNotNull(supplierProducts.erpProductId)),
    );
}

export interface ErpStockReading {
  readonly erpProductId: number;
  /** Whole units, never negative. */
  readonly stock: number;
}

export interface ErpStockChange {
  readonly productId: string;
  readonly sku: string;
  readonly previousStock: number;
  readonly stock: number;
  readonly reservedStock: number;
}

/**
 * Writes the balances read from Bling at `readAt` into the linked products' `stock`, and only
 * `stock`. A product already holding a reading taken later keeps it (notifications and checks
 * may finish out of order). Returns the products whose stock changed.
 */
export async function applyErpStockReadings(
  database: Database,
  input: { supplierId: string; readAt: Date; readings: readonly ErpStockReading[] },
): Promise<ErpStockChange[]> {
  if (input.readings.length === 0) {
    return [];
  }
  const values = sql.join(
    input.readings.map(
      (reading) => sql`(${reading.erpProductId}::bigint, ${reading.stock}::integer)`,
    ),
    sql`, `,
  );
  const readAt = input.readAt.toISOString();
  // Joining the table to itself as "previous" reads each row as it was before this update.
  const rows = await database.execute<{
    id: string;
    sku: string;
    previous_stock: number;
    stock: number;
    reserved_stock: number;
  }>(sql`
    update supplier_products as product
    set stock = reading.stock, erp_stock_read_at = ${readAt}::timestamptz
    from (values ${values}) as reading(erp_product_id, stock), supplier_products as previous
    where previous.id = product.id
      and product.supplier_id = ${input.supplierId}
      and product.erp_product_id = reading.erp_product_id
      and (product.erp_stock_read_at is null or product.erp_stock_read_at < ${readAt}::timestamptz)
    returning product.id, product.sku, previous.stock as previous_stock, product.stock,
      product.reserved_stock
  `);
  return rows
    .filter((row) => row.previous_stock !== row.stock)
    .map((row) => ({
      productId: row.id,
      sku: row.sku,
      previousStock: row.previous_stock,
      stock: row.stock,
      reservedStock: row.reserved_stock,
    }));
}

/** A check that read every linked product: when, and the failure streak cleared. */
export async function recordErpStockCheckSuccess(
  database: Database,
  input: { connectionId: string; checkedAt: Date },
): Promise<void> {
  await database
    .update(supplierErpConnections)
    .set({ stockCheckedAt: input.checkedAt, stockCheckFailures: 0 })
    .where(eq(supplierErpConnections.id, input.connectionId));
}

/** Counts one more failed check in a row and returns the new streak. */
export async function recordErpStockCheckFailure(
  database: Database,
  connectionId: string,
): Promise<number> {
  const [row] = await database
    .update(supplierErpConnections)
    .set({ stockCheckFailures: sql`${supplierErpConnections.stockCheckFailures} + 1` })
    .where(eq(supplierErpConnections.id, connectionId))
    .returning({ failures: supplierErpConnections.stockCheckFailures });
  return row?.failures ?? 0;
}
