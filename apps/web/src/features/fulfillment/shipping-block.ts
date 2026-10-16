import type { OrderStatus } from "@sellbridge/shared/schemas";

/** Unpaid, cancelled or returned orders: no parcel of theirs may move forward. */
const UNSHIPPABLE_ORDER_STATUSES: ReadonlySet<string> = new Set<OrderStatus>([
  "pending",
  "cancelled",
  "returned",
]);

export function isShippingBlocked(orderStatus: string): boolean {
  return UNSHIPPABLE_ORDER_STATUSES.has(orderStatus);
}
