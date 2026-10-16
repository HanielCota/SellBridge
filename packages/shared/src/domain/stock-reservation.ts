import type { OrderStatus } from "../schemas/orders.ts";

export type { OrderStatus };

/*
 * Supplier stock is shared by every reseller who sells the product. The admin keeps the shelf
 * count (`stock`); paid orders that have not shipped hold units in `reserved_stock`. What can
 * still be sold is the difference. Each order item remembers what it did, so a sale is held,
 * taken and given back at most once, however many times the marketplace re-sends the order.
 */

export const STOCK_STATES = [
  "untracked",
  "pending",
  "reserved",
  "consumed",
  "short",
  "released",
] as const;
/**
 * - `untracked`: sold before reservations existed; never touched.
 * - `pending`: nothing held yet (unpaid order).
 * - `reserved`: units held for a paid order still on the supplier's shelf.
 * - `consumed`: the units left the shelf (shipped).
 * - `short`: paid, but there was not enough to hold; the reseller has to act.
 * - `released`: done for good (hold let go, units back on the shelf, or shortage closed).
 */
export type StockState = (typeof STOCK_STATES)[number];

/** What an order item does to the supplier's stock when its order reaches a status. */
export type StockMove = "reserve" | "consume" | "release" | "restock" | "settle" | "none";

const SHIPPED: ReadonlySet<OrderStatus> = new Set(["shipped", "delivered"]);
const UNDONE: ReadonlySet<OrderStatus> = new Set(["cancelled", "returned"]);
const NOT_YET_TAKEN: ReadonlySet<StockState> = new Set(["pending", "short"]);

const UNDO_MOVES: Partial<Record<StockState, StockMove>> = {
  reserved: "release",
  consumed: "restock",
  short: "settle",
};
/**
 * A returned parcel goes to the marketplace seller's address (the reseller), not back to the
 * supplier's shelf: units that left are closed without adding them back. The supplier counts
 * them when they arrive.
 */
const RETURN_MOVES: Partial<Record<StockState, StockMove>> = { ...UNDO_MOVES, consumed: "settle" };

export function stockMoveFor(status: OrderStatus, state: StockState): StockMove {
  if (status === "paid" && NOT_YET_TAKEN.has(state)) {
    return "reserve";
  }
  if (SHIPPED.has(status) && (NOT_YET_TAKEN.has(state) || state === "reserved")) {
    return "consume";
  }
  if (status === "returned") {
    return RETURN_MOVES[state] ?? "none";
  }
  if (UNDONE.has(status)) {
    return UNDO_MOVES[state] ?? "none";
  }
  return "none";
}

/** Units a reseller can still sell: the shelf count minus what paid orders hold. */
export function availableUnits(stock: number, reserved: number): number {
  return Math.max(0, stock - reserved);
}

/**
 * Units offered on the marketplaces: what is sellable minus a safety margin, so a shelf count
 * that lags behind reality does not turn into a sale nobody can ship. Mirrors `liveStock` in
 * the database package.
 */
export function offeredUnits(stock: number, reserved: number, safetyUnits: number): number {
  return Math.max(0, availableUnits(stock, reserved) - safetyMargin(safetyUnits));
}

/** A whole, non-negative number of units; anything else (NaN, negative) means no margin. */
export function safetyMargin(safetyUnits: number): number {
  if (!Number.isFinite(safetyUnits)) {
    return 0;
  }
  return Math.max(0, Math.trunc(safetyUnits));
}
