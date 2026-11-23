import {
  FULFILLMENT_LABELS,
  type FulfillmentStatus,
  type OrderStatus,
} from "@sellbridge/shared/schemas";
import type { StatusTone } from "@/components/data/tone-status";

/** Same palette as the order status (`OrderStatusBadge`): a returned parcel is as red as its order. */
export const FULFILLMENT_TONES: Record<FulfillmentStatus, StatusTone> = {
  forwarded: "muted",
  accepted: "info",
  picking: "info",
  ready: "info",
  shipped: "info",
  delivered: "success",
  not_delivered: "warning",
  returned: "danger",
  cancelled: "muted",
};

/**
 * Newest first, like the other timelines. Events recorded in the same instant keep their order,
 * reversed, so the later write still reads first.
 */
export function shipmentTimeline<Event extends { createdAt: Date | string }>(
  events: readonly Event[],
): Event[] {
  return events
    .map((event, index) => ({ event, index, time: new Date(event.createdAt).getTime() }))
    .toSorted((left, right) => right.time - left.time || right.index - left.index)
    .map(({ event }) => event);
}

const SELLER_FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  forwarded: "Aguardando sua preparação",
  accepted: "Preparação aceita",
  picking: "Em separação",
  ready: "Pronto para envio",
  shipped: "Enviado",
  delivered: "Entregue",
  not_delivered: "Problema na entrega",
  returned: "Devolvido",
  cancelled: "Preparação interrompida",
};

export function shipmentStatusLabel(
  status: FulfillmentStatus,
  catalogKind?: "seller" | "supplier",
) {
  return catalogKind === "seller" ? SELLER_FULFILLMENT_LABELS[status] : FULFILLMENT_LABELS[status];
}

/**
 * The status as the supplier reads it on its own screens: a forwarded parcel waits for them, so
 * "Aguardando fornecedor" would point at themselves.
 */
export function supplierShipmentStatusLabel(status: FulfillmentStatus): string {
  return status === "forwarded" ? "Aguardando seu aceite" : FULFILLMENT_LABELS[status];
}

/** The status the order list stresses: a paid order nobody sent to the supplier yet. */
export const ORDER_TO_FORWARD_LABEL = "Falta enviar ao fornecedor";

/**
 * The badge and the button of a paid order nobody sent yet: to the supplier, or, when every item
 * is the reseller's own stock, to the reseller's own preparation.
 */
export function toForwardWords(ownItemsOnly: boolean): { badge: string; button: string } {
  if (ownItemsOnly) {
    return { badge: "Falta preparar o envio", button: "Preparar o envio" };
  }
  return { badge: ORDER_TO_FORWARD_LABEL, button: "Enviar ao fornecedor" };
}

/** A paid order with no parcel waits for the reseller: the list gives it its own badge and button. */
export function waitsToBeForwarded(order: {
  status: string;
  shipments: readonly unknown[];
}): boolean {
  return order.status === "paid" && order.shipments.length === 0;
}

/** What the order list says under an order before any parcel exists, by the order's status. */
const BEFORE_FORWARDING: Record<OrderStatus, string | null> = {
  // The badge and the button already say it.
  paid: null,
  pending: "Espere o comprador pagar",
  cancelled: "Venda cancelada: nada a enviar",
  returned: "Pedido devolvido",
  shipped: "Não foi enviado pelo SellBridge",
  delivered: "Não foi enviado pelo SellBridge",
};

/**
 * One line per parcel ("Seu envio: Separando · Fornecedor X: Enviado"), or, before any parcel,
 * what the reseller does about the order: wait for the buyer, nothing, or (no line) send it.
 */
export function shipmentsSummary(
  shipments: readonly {
    status: FulfillmentStatus;
    catalogKind: "seller" | "supplier";
    supplierName: string;
  }[],
  orderStatus: OrderStatus,
): string | null {
  if (shipments.length === 0) {
    return BEFORE_FORWARDING[orderStatus];
  }
  return shipments
    .map((shipment) => {
      const who = shipment.catalogKind === "seller" ? "Seu envio" : shipment.supplierName;
      return `${who}: ${shipmentStatusLabel(shipment.status, shipment.catalogKind)}`;
    })
    .join(" · ");
}

/** The first step's note from before the supplier link was retired, still stored on old parcels. */
const RETIRED_LINK_NOTE = "Ordem de fornecimento criada. Compartilhe o link com o fornecedor.";

/** A history note as people read it today: the retired link's note says where the order went. */
export function historyNote(note: string): string {
  if (note === RETIRED_LINK_NOTE) {
    return "Pedido enviado ao fornecedor. Ele vê no painel do SellBridge.";
  }
  return note;
}

/** Why there is nothing to send, one sentence per situation instead of the three at once. */
export function blockedOrderMessage(status: OrderStatus, hasParcels: boolean): string {
  if (status === "pending") {
    return "O comprador ainda não pagou. Quando o pagamento for confirmado, o botão Enviar ao fornecedor aparece aqui.";
  }
  if (hasParcels) {
    return status === "returned"
      ? "Pedido devolvido. Veja em cada envio o que acontece com o pacote."
      : "Venda cancelada. Veja em cada envio o que acontece com o pacote.";
  }
  return status === "returned"
    ? "Pedido devolvido. Não há nada a enviar."
    : "Venda cancelada. Não há nada a enviar.";
}
