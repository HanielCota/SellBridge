import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { erpStockExits, type ErpStockOperation } from "../schema/index.ts";
import { owedStockExit } from "./sql/owed-stock-exit.ts";

/** A reservation still "posting" after this long lost its worker mid-call. */
const STALLED_POSTING_IN_MINUTES = 10;

/** An order item whose stock movement (a sale's exit, or its return's entry) is due in the ERP. */
export interface ErpStockExitDue {
  readonly orderItemId: string;
  readonly supplierId: string;
  readonly supplierProductId: string;
  readonly erpProductId: number;
  readonly sku: string;
  readonly title: string;
  readonly quantity: number;
  /** The marketplace's order number, shown in the ERP's note and on the Problemas page. */
  readonly externalOrderId: string;
}

/**
 * Sold items whose units left the supplier's shelf (shipped), linked to a connected Bling
 * account whose products a full check relinked, shipped since the account's `stock_exits_since`
 * (however long ago: an exit blocked by a lost connection still posts once it is back), whose
 * parcel does not get its NF-e through SellBridge, and with no exit row yet.
 */
export async function listErpStockExitsDue(
  database: Database,
  limit: number,
): Promise<ErpStockExitDue[]> {
  const rows = await database.execute<DueMovementRow>(sql`
    select item.id as order_item_id, product.supplier_id, product.id as supplier_product_id,
      product.erp_product_id, product.sku, item.title, item.quantity,
      sale.external_order_id
    from order_items as item
    join supplier_products as product on product.id = item.supplier_product_id
    join supplier_erp_connections as connection
      on connection.supplier_id = product.supplier_id
      and connection.provider = 'bling'
      and connection.status = 'connected'
      -- Links are only trusted once a full check ran on this connection: a reconnection may
      -- be another Bling company, whose ids mean other products until the check relinks them.
      and connection.stock_checked_at >= connection.connected_at
    join orders as sale on sale.id = item.order_id
    where ${owedStockExit}
      and not exists (
        select 1 from erp_stock_exits as posted
        where posted.order_item_id = item.id and posted.operation = 'exit'
      )
    order by item.id
    limit ${limit}
  `);
  return rows.map(toDueMovement);
}

type DueMovementRow = {
  order_item_id: string;
  supplier_id: string;
  supplier_product_id: string;
  erp_product_id: string | number;
  sku: string;
  title: string;
  quantity: number;
  external_order_id: string;
};

function toDueMovement(row: DueMovementRow): ErpStockExitDue {
  return {
    orderItemId: row.order_item_id,
    supplierId: row.supplier_id,
    supplierProductId: row.supplier_product_id,
    erpProductId: Number(row.erp_product_id),
    sku: row.sku,
    title: row.title,
    quantity: row.quantity,
    externalOrderId: row.external_order_id,
  };
}

/**
 * Returned items the supplier put back on its shelf whose sale's exit SellBridge posted to the
 * ERP, with no entry row yet: the entry reverses that exit, same product and quantity. An item
 * whose exit SellBridge did not post (its NF-e went through SellBridge, or the exit waits on the
 * team) gets no entry: the ERP's own stock moved some other way, and an entry could count the
 * units twice. Needs the same connection rules as the exits.
 */
export async function listErpStockEntriesDue(
  database: Database,
  limit: number,
): Promise<ErpStockExitDue[]> {
  const rows = await database.execute<DueMovementRow>(sql`
    select item.id as order_item_id, product.supplier_id, product.id as supplier_product_id,
      sold.erp_product_id, sold.sku, item.title, sold.quantity, sold.external_order_id
    from return_claims as claim
    join order_items as item
      on item.order_id = claim.order_id and item.id = any(claim.restock_item_ids)
    join erp_stock_exits as sold
      on sold.order_item_id = item.id and sold.operation = 'exit' and sold.status = 'posted'
    join supplier_products as product
      on product.id = item.supplier_product_id and product.erp_product_id = sold.erp_product_id
    join supplier_erp_connections as connection
      on connection.supplier_id = product.supplier_id
      and connection.provider = 'bling'
      and connection.status = 'connected'
      and connection.stock_checked_at >= connection.connected_at
    where claim.stock_returned_at is not null
      and claim.stock_returned_at >= connection.stock_exits_since
      and not exists (
        select 1 from erp_stock_exits as returned
        where returned.order_item_id = item.id and returned.operation = 'entry'
      )
    order by item.id
    limit ${limit}
  `);
  return rows.map(toDueMovement);
}

/**
 * Reserves the item's movement before calling the ERP and returns its id; null when a row of
 * that operation already exists (posted, being posted, or waiting for the team): a movement is
 * never posted twice.
 */
export async function reserveErpStockExit(
  database: Database,
  exit: ErpStockExitDue,
  operation: ErpStockOperation,
): Promise<string | null> {
  const [row] = await database
    .insert(erpStockExits)
    .values({
      orderItemId: exit.orderItemId,
      operation,
      supplierId: exit.supplierId,
      supplierProductId: exit.supplierProductId,
      erpProductId: exit.erpProductId,
      quantity: exit.quantity,
      sku: exit.sku,
      externalOrderId: exit.externalOrderId,
      status: "posting",
    })
    .onConflictDoNothing({ target: [erpStockExits.orderItemId, erpStockExits.operation] })
    .returning({ id: erpStockExits.id });
  return row?.id ?? null;
}

export async function markErpStockExitPosted(
  database: Database,
  input: { exitId: string; erpStockId: number },
): Promise<void> {
  await database
    .update(erpStockExits)
    .set({ status: "posted", erpStockId: input.erpStockId, problem: null })
    .where(and(eq(erpStockExits.id, input.exitId), eq(erpStockExits.status, "posting")));
}

/**
 * Ends a reservation the team must look at: "uncertain" (the ERP may have posted it) or
 * "failed" (the ERP refused it). Neither is ever retried on its own.
 */
export async function markErpStockExitForTeam(
  database: Database,
  input: { exitId: string; status: "uncertain" | "failed"; problem: string },
): Promise<void> {
  await database
    .update(erpStockExits)
    .set({ status: input.status, problem: input.problem })
    .where(and(eq(erpStockExits.id, input.exitId), eq(erpStockExits.status, "posting")));
}

/**
 * Drops a reservation the ERP surely never received (the access was refused, or the rate limit
 * answered), so the next sweep posts the exit.
 */
export async function releaseErpStockExit(database: Database, exitId: string): Promise<void> {
  await database
    .delete(erpStockExits)
    .where(and(eq(erpStockExits.id, exitId), eq(erpStockExits.status, "posting")));
}

export interface StalledErpStockExit {
  readonly exitId: string;
  readonly supplierId: string;
  readonly sku: string;
  readonly externalOrderId: string;
  readonly quantity: number;
}

/**
 * Turns reservations left "posting" by a worker that stopped mid-call into "uncertain" and
 * returns them: whether the ERP posted them cannot be known.
 */
export async function takeStalledErpStockExits(
  database: Database,
  input: { operation: ErpStockOperation; problem: string },
): Promise<StalledErpStockExit[]> {
  return database
    .update(erpStockExits)
    .set({ status: "uncertain", problem: input.problem })
    .where(
      and(
        eq(erpStockExits.status, "posting"),
        eq(erpStockExits.operation, input.operation),
        lt(
          erpStockExits.createdAt,
          sql`now() - make_interval(mins => ${STALLED_POSTING_IN_MINUTES})`,
        ),
      ),
    )
    .returning({
      exitId: erpStockExits.id,
      supplierId: erpStockExits.supplierId,
      sku: erpStockExits.sku,
      externalOrderId: erpStockExits.externalOrderId,
      quantity: erpStockExits.quantity,
    });
}
