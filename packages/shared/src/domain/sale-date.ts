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
