import { FULFILLMENT_LABELS, type FulfillmentStatus } from "@sellbridge/shared/schemas";
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
