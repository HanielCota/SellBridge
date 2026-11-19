import type { PreparationHold } from "@sellbridge/shared/receiving-rules";
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

/**
 * Nothing about the parcel may move: the sale is not released, or the parcel waits for the
 * supplier's receiving account or the reseller's payment.
 */
export function isPreparationStopped(parcel: {
  orderStatus: string;
  preparationHold?: PreparationHold | null;
}): boolean {
  return isShippingBlocked(parcel.orderStatus) || (parcel.preparationHold ?? null) !== null;
}
