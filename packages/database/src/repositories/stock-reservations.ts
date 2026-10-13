import {
  stockMoveFor,
  type OrderStatus,
  type StockMove,
  type StockState,
} from "@sellbridge/shared/stock-reservation";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { orderItems, supplierProducts } from "../schema/index.ts";

interface StockItem {
  id: string;
  supplierProductId: string;
  quantity: number;
  stockState: StockState;
}

/**
 * Moves the item to its next state; false when another write got there first. Coming up short
 * also dates the shortage, once: a retry that is still short keeps the warning's original date.
 */
async function markItem(
  executor: DatabaseExecutor,
  item: StockItem,
  next: StockState,
): Promise<boolean> {
  const marked = await executor
    .update(orderItems)
    .set({
      stockState: next,
      ...(next === "short" ? { shortSince: sql`coalesce(${orderItems.shortSince}, now())` } : {}),
    })
    .where(and(eq(orderItems.id, item.id), eq(orderItems.stockState, item.stockState)))
    .returning({ id: orderItems.id });
  return marked.length > 0;
}

/**
 * Sales move units but are not a new count from the supplier: `updated_at` keeps the date of
 * the last admin edit, which is what "estoque atualizado há X" tells the reseller.
 */
const KEEP_UPDATED_AT = { updatedAt: sql`${supplierProducts.updatedAt}` };

async function shiftShelf(
  executor: DatabaseExecutor,
  item: StockItem,
  change: { stock?: SQL; reservedStock?: SQL },
): Promise<void> {
  await executor
    .update(supplierProducts)
    .set({ ...change, ...KEEP_UPDATED_AT })
    .where(eq(supplierProducts.id, item.supplierProductId));
}

/**
 * Holds the units only if they are all still sellable. The row lock of the UPDATE serializes
 * sales of the same product, so two buyers can never both get the last unit.
 */
async function reserve(executor: DatabaseExecutor, item: StockItem): Promise<void> {
  const held = await executor
    .update(supplierProducts)
    .set({
      reservedStock: sql`${supplierProducts.reservedStock} + ${item.quantity}`,
      ...KEEP_UPDATED_AT,
    })
    .where(
      and(
        eq(supplierProducts.id, item.supplierProductId),
        sql`${supplierProducts.stock} - ${supplierProducts.reservedStock} >= ${item.quantity}`,
      ),
    )
    .returning({ id: supplierProducts.id });
  // The item row is locked by applyStockMoves, so this cannot miss; if it ever did, rolling back
  // beats keeping a hold that no item accounts for.
  if (!(await markItem(executor, item, held.length > 0 ? "reserved" : "short"))) {
    throw new Error("O item do pedido mudou durante a reserva de estoque");
  }
}

/** The units left the shelf: the hold (if any) becomes a real decrease of the shelf count. */
async function consume(executor: DatabaseExecutor, item: StockItem): Promise<void> {
  if (!(await markItem(executor, item, "consumed"))) {
    return;
  }
  const heldUnits = item.stockState === "reserved" ? item.quantity : 0;
  // The supplier shipped it even if our count was lower: the shelf may owe units until the next
  // count, and a return gives back exactly what left.
  await shiftShelf(executor, item, {
    stock: sql`${supplierProducts.stock} - ${item.quantity}`,
    reservedStock: sql`${supplierProducts.reservedStock} - ${heldUnits}`,
  });
}

/** Lets go of a hold: the units never left the shelf. */
async function release(executor: DatabaseExecutor, item: StockItem): Promise<void> {
  if (!(await markItem(executor, item, "released"))) {
    return;
  }
  await shiftShelf(executor, item, {
    reservedStock: sql`${supplierProducts.reservedStock} - ${item.quantity}`,
  });
}

/** Units that had shipped come back to the shelf (a return, or a cancel after shipping). */
async function restock(executor: DatabaseExecutor, item: StockItem): Promise<void> {
  if (!(await markItem(executor, item, "released"))) {
    return;
  }
  await shiftShelf(executor, item, { stock: sql`${supplierProducts.stock} + ${item.quantity}` });
}

/** A shortage on an undone order just closes: nothing was held. */
async function settle(executor: DatabaseExecutor, item: StockItem): Promise<void> {
  await markItem(executor, item, "released");
}

const MOVES: Record<Exclude<StockMove, "none">, typeof reserve> = {
  reserve,
  consume,
  release,
  restock,
  settle,
};

/**
 * Brings the supplier stock in line with the order's status, inside the transaction that wrote
 * the order. Items are locked in product order, so two orders never wait on each other's rows
 * in opposite order. Items that are not one of our listings are left alone. Returns how many
 * items moved stock, so callers know whether the marketplaces need a fresh count.
 */
export async function applyStockMoves(
  executor: DatabaseExecutor,
  orderId: string,
  status: OrderStatus,
): Promise<number> {
  const items = await executor
    .select({
      id: orderItems.id,
      supplierProductId: orderItems.supplierProductId,
      quantity: orderItems.quantity,
      stockState: orderItems.stockState,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.supplierProductId), asc(orderItems.id))
    .for("update");
  let moved = 0;
  for (const item of items) {
    const move = stockMoveFor(status, item.stockState);
    if (item.supplierProductId === null || move === "none") {
      continue;
    }
    // Sequential on purpose: each move writes inside the same transaction.
    await MOVES[move](executor, { ...item, supplierProductId: item.supplierProductId });
    moved += 1;
  }
  return moved;
}
