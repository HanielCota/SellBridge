import type { FinanceOrderStatus } from "./finance.ts";
import { brazilMonthOf } from "./report-period.ts";

/**
 * Statuses that say the buyer paid: a sale (paid, shipped, delivered) or a sale the buyer sent
 * back. Awaiting payment and cancelled say nothing about a payment.
 */
const PAID_STATUSES: readonly FinanceOrderStatus[] = ["paid", "shipped", "delivered", "returned"];

function showsPayment(status: FinanceOrderStatus): boolean {
  return PAID_STATUSES.includes(status);
}

/**
 * The payment date of an order seen for the first time, or null while it is unpaid. An order
 * that arrives paid was paid when it was placed, unless that month is already over: a closed
 * month's report is kept as it was, so the sale counts in the month SellBridge saw it.
 */
export function paidAtOfNewOrder(input: {
  status: FinanceOrderStatus;
  orderedAt: Date;
  now: Date;
}): Date | null {
  if (!showsPayment(input.status)) {
    return null;
  }
  if (brazilMonthOf(input.orderedAt) < brazilMonthOf(input.now)) {
    return input.now;
  }
  return input.orderedAt;
}

/** The first sync that sees the order paid dates the payment; later syncs keep that date. */
export function paidAtOfKnownOrder(input: {
  paidAt: Date | null;
  status: FinanceOrderStatus;
  now: Date;
}): Date | null {
  if (input.paidAt !== null) {
    return input.paidAt;
  }
  if (!showsPayment(input.status)) {
    return null;
  }
  return input.now;
}

/** Statuses that undo a sale the buyer paid: it stops counting from that moment on. */
const REVERSAL_STATUSES: readonly FinanceOrderStatus[] = ["cancelled", "returned"];

function undoesSale(status: FinanceOrderStatus): boolean {
  return REVERSAL_STATUSES.includes(status);
}

/**
 * When a sale was undone, for an order seen for the first time: an order that arrives returned
 * was paid and undone before SellBridge saw it, so both happen at its payment date and it never
 * counts. A cancelled one arrives unpaid and was never a sale.
 */
export function reversedAtOfNewOrder(input: {
  status: FinanceOrderStatus;
  paidAt: Date | null;
}): Date | null {
  if (input.paidAt === null || !undoesSale(input.status)) {
    return null;
  }
  return input.paidAt;
}

/**
 * The first sync that sees a paid order cancelled or returned dates its reversal; later syncs
 * keep that date. Monthly money reports take the sale back in the period of this date, so a
 * closed month keeps the sale it had and the next one shows the cancellation.
 */
export function reversedAtOfKnownOrder(input: {
  reversedAt: Date | null;
  paidAt: Date | null;
  status: FinanceOrderStatus;
  now: Date;
}): Date | null {
  if (input.reversedAt !== null) {
    return input.reversedAt;
  }
  if (input.paidAt === null || !undoesSale(input.status)) {
    return null;
  }
  return input.now;
}
