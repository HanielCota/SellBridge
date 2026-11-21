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

export interface SaleStopNotice {
  title: string;
  description: string;
}

/**
 * What the supplier reads when the sale stops its parcel: a cancelled sale is final (do not ship),
 * an unpaid or returned one is something to talk over with the reseller. Null when it ships.
 */
export function saleStopNotice(orderStatus: string): SaleStopNotice | null {
  if (orderStatus === "cancelled") {
    return {
      title: "Venda cancelada: não envie",
      description:
        "O pedido foi cancelado e passou para Encerrados. O prazo não conta mais. Se você já separou o produto, devolva ao estoque.",
    };
  }
  if (isShippingBlocked(orderStatus)) {
    return {
      title: "Venda não liberada",
      description: "Fale com o revendedor antes de separar ou despachar.",
    };
  }
  return null;
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
