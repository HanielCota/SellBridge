import type {
  NotificationEvent,
  NotificationKind,
  SaleProduct,
} from "@sellbridge/database/repositories";
import { unavailableListingMessage } from "@sellbridge/shared/catalog-availability";
import { formatCents } from "@sellbridge/shared/money";
import { displayStoreName } from "@/features/stores/store-name";
import type { NotificationFeed } from "./notification-feed";

export type { NotificationKind };

/** One row of the notification bell. */
export interface AppNotification {
  /** Stable per event, so the list keys do not shuffle between polls. */
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  at: Date;
  /** Where the notification leads. */
  href: string;
  /** What a sale sold, shown as its picture; only sales carry it. */
  product?: SaleProduct | null;
}

export interface PresentedNotifications {
  items: AppNotification[];
  unread: number;
  seenAt: Date | null;
}

type OrderProblemEvent = Extract<
  NotificationEvent,
  { kind: "stock_shortage" | "shipment_cancelled" }
>;

/** An order waiting on the reseller: what went wrong and what to do, on the order's page. */
function orderProblem(
  event: OrderProblemEvent,
): Pick<AppNotification, "id" | "title" | "detail" | "href"> {
  if (event.kind === "stock_shortage") {
    return {
      id: `shortage:${event.entityId}`,
      title: `Falta estoque para o pedido #${event.externalOrderId}`,
      detail: `${event.productTitle}: o fornecedor está sem unidades. Combine com ele ou cancele a venda.`,
      href: `/pedidos/${event.entityId}`,
    };
  }
  return {
    id: `shipment-cancelled:${event.shipmentId}`,
    title: `${event.supplierName} cancelou o envio do pedido #${event.externalOrderId}`,
    detail: `Motivo: ${event.reason.replace(/\.$/, "")}. Reencaminhe ao fornecedor ou cancele a venda.`,
    href: `/pedidos/${event.entityId}`,
  };
}

/** What is late about a parcel, and the reseller's next step. */
const LATE_COPY: Record<
  Extract<NotificationEvent, { kind: "shipment_late" }>["delay"],
  { title: string; detail: (supplierName: string) => string }
> = {
  accept_overdue: {
    title: "Aceite atrasado no pedido",
    detail: (supplierName) => `${supplierName} ainda não aceitou o pedido. Fale com o fornecedor.`,
  },
  dispatch_overdue: {
    title: "Despacho atrasado no pedido",
    detail: (supplierName) =>
      `${supplierName} passou do prazo para despachar. Fale com o fornecedor.`,
  },
  delivery_overdue: {
    title: "Entrega atrasada no pedido",
    detail: (supplierName) =>
      `Passou da data prevista e o pacote de ${supplierName} não foi entregue. Confira o rastreio.`,
  },
  awaiting_confirmation: {
    title: "Confirme a entrega do pedido",
    detail: (supplierName) =>
      `O pacote de ${supplierName} foi enviado há mais de 7 dias. Se chegou, marque como entregue.`,
  },
};

/** A parcel late to leave, to arrive or to be confirmed, on the order's page. */
function shipmentLate(
  event: Extract<NotificationEvent, { kind: "shipment_late" }>,
): Pick<AppNotification, "id" | "title" | "detail" | "href"> {
  const copy = LATE_COPY[event.delay];
  return {
    id: `shipment-late:${event.shipmentId}:${event.delay}`,
    title: `${copy.title} #${event.externalOrderId}`,
    detail: copy.detail(event.supplierName),
    href: `/pedidos/${event.entityId}`,
  };
}

/** A listing the supplier keeps off: paused by the deactivation of the product or supplier. */
function listingUnavailable(
  event: Extract<NotificationEvent, { kind: "listing_unavailable" }>,
): Pick<AppNotification, "id" | "title" | "detail" | "href"> {
  return {
    id: `unavailable:${event.entityId}`,
    title: `Anúncio pausado: ${event.listingTitle}`,
    detail: unavailableListingMessage(event.reason),
    href: `/publicacoes?query=${encodeURIComponent(event.listingTitle)}`,
  };
}

/** Wording and destination of each kind of event, in the reseller's language. */
export function presentNotification(event: NotificationEvent): AppNotification {
  const base = { kind: event.kind, at: event.at };
  // The switch narrows each kind; what is left after it is a support reply.
  switch (event.kind) {
    case "sale":
      return {
        ...base,
        id: `sale:${event.entityId}`,
        title: `Nova venda de ${formatCents(event.totalCents)}`,
        // The product says more than the order code; the code is still one click away.
        detail: `${event.product?.title ?? event.externalOrderId} · ${displayStoreName(event.storeName)}`,
        href: `/financeiro?query=${encodeURIComponent(event.externalOrderId)}`,
        product: event.product,
      };
    case "listing_error":
      return {
        ...base,
        id: `listing:${event.entityId}:${event.at.getTime()}`,
        title: `Publicação recusada: ${event.listingTitle}`,
        detail: event.errorReason ?? "Erro ao publicar",
        href: "/publicacoes?status=error",
      };
    case "store_problem":
      return {
        ...base,
        id: `store:${event.entityId}:${event.at.getTime()}`,
        title: `${displayStoreName(event.storeName)} precisa ser reconectada`,
        detail: "Pedidos e estoque estão parados nesta loja.",
        href: "/lojas",
      };
    case "stock_shortage":
    case "shipment_cancelled":
      return { ...base, ...orderProblem(event) };
    case "shipment_late":
      return { ...base, ...shipmentLate(event) };
    case "listing_unavailable":
      return { ...base, ...listingUnavailable(event) };
    case "review_pending":
      return {
        ...base,
        id: `reviews:${event.pending}:${event.at.getTime()}`,
        title:
          event.pending === 1
            ? "1 pedido esperando sua avaliação"
            : `${event.pending} pedidos esperando sua avaliação`,
        detail: "Avalie os fornecedores para formar o score deles.",
        href: "/pedidos",
      };
  }
  return {
    ...base,
    id: `ticket:${event.entityId}:${event.at.getTime()}`,
    title: "O suporte respondeu",
    detail: event.subject,
    href: `/suporte/${event.entityId}`,
  };
}

export function presentNotificationFeed(feed: NotificationFeed): PresentedNotifications {
  return {
    items: feed.events.map((event) => presentNotification(event)),
    unread: feed.unread,
    seenAt: feed.seenAt,
  };
}
