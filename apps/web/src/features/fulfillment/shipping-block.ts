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

/** Parcels already with the carrier: a cancelled sale brings them back as a return. */
const ON_THE_WAY_STATUSES: ReadonlySet<string> = new Set(["shipped", "not_delivered"]);

/**
 * What the supplier reads when the sale stops its parcel: a cancelled sale is final (do not ship),
 * an unpaid or returned one is something to talk over with the reseller. A parcel that had already
 * left comes back as a return; one delivered or back is settled. Null when nothing stops it.
 */
export function saleStopNotice(
  orderStatus: string,
  parcelStatus: string,
  where: "panel" | "link" = "panel",
): SaleStopNotice | null {
  if (orderStatus === "cancelled" && ON_THE_WAY_STATUSES.has(parcelStatus)) {
    return {
      title: "Venda cancelada depois do envio",
      description:
        "O pacote já tinha saído. Ele volta para você como devolução: acompanhe pelo rastreio.",
    };
  }
  if (
    orderStatus === "cancelled" &&
    (parcelStatus === "delivered" || parcelStatus === "returned")
  ) {
    return null;
  }
  if (orderStatus === "cancelled") {
    return {
      title: "Venda cancelada: não envie",
      // Only the panel has an "Encerrados" tab to point at.
      description:
        where === "panel"
          ? "O pedido foi cancelado e passou para Encerrados. O prazo não conta mais. Se você já separou o produto, devolva ao estoque."
          : "O pedido foi cancelado. O prazo não conta mais. Se você já separou o produto, devolva ao estoque.",
    };
  }
  if (isShippingBlocked(orderStatus) && where === "link") {
    return {
      title: "Pedido sem liberação para envio",
      description:
        "O marketplace ainda não liberou este pedido. Fale com o revendedor antes de separar ou enviar.",
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
