import { formatCents } from "./money.ts";
import type { NotificationChannelName, NotificationContent } from "./notification-content.ts";
import { SHIPMENT_DELAY_LABELS, type ShipmentDelay } from "./shipment-delay.ts";

/** Facts that notify the reseller's workspace (item 25). Stored as text: append, never rename. */
export const NOTIFICATION_EVENTS = [
  "sale_paid",
  "shipment_late",
  "order_delivered",
  "store_expired",
  "listing_failed",
  "support_reply",
  "ticket_created",
  "order_message",
  "supplier_conversation",
] as const;
export type NotificationEventName = (typeof NOTIFICATION_EVENTS)[number];

export function isNotificationEvent(value: string): value is NotificationEventName {
  return NOTIFICATION_EVENTS.some((event) => event === value);
}

interface EventDefinition {
  /** Who it is for: the reseller's workspace, or the SellBridge support team. */
  audience: "reseller" | "staff";
  label: string;
  description: string;
  /** What each channel does when the person never chose; absent = the channel can't carry it. */
  defaults: Partial<Record<NotificationChannelName, boolean>>;
}

/**
 * Wording on the preferences screen and default channels. The bell already shows every one of
 * these except deliveries (a delivered order only shows up as a review to make); push is listed
 * so the choice is saved, though no push provider is wired yet.
 */
export const NOTIFICATION_EVENT_DEFINITIONS: Record<NotificationEventName, EventDefinition> = {
  sale_paid: {
    audience: "reseller",
    label: "Venda paga",
    description: "Um pedido foi pago e precisa ser encaminhado ao fornecedor.",
    defaults: { in_app: true, email: true, push: true },
  },
  shipment_late: {
    audience: "reseller",
    label: "Envio atrasado",
    description: "Um pacote passou do prazo de despacho ou de entrega.",
    defaults: { in_app: true, email: true, push: true },
  },
  order_delivered: {
    audience: "reseller",
    label: "Pedido entregue",
    description: "O comprador recebeu o pedido.",
    defaults: { email: false, push: false },
  },
  store_expired: {
    audience: "reseller",
    label: "Loja desconectada",
    description: "O acesso a uma loja expirou e pedidos e estoque pararam.",
    defaults: { in_app: true, email: true, push: true },
  },
  listing_failed: {
    audience: "reseller",
    label: "Erro de publicação",
    description: "O marketplace recusou um anúncio.",
    defaults: { in_app: true, email: true, push: false },
  },
  support_reply: {
    audience: "reseller",
    label: "Resposta do suporte",
    description: "A equipe respondeu um chamado seu.",
    defaults: { in_app: true, email: true, push: true },
  },
  order_message: {
    audience: "reseller",
    label: "Mensagem do fornecedor",
    description: "O fornecedor escreveu nas mensagens de um pedido.",
    defaults: { in_app: true, email: true, push: true },
  },
  // Both directions: the supplier hears about a reseller's message, the reseller about a reply.
  supplier_conversation: {
    audience: "reseller",
    label: "Conversa entre loja e fornecedor",
    description: "Chegou uma mensagem nova numa conversa entre loja e fornecedor.",
    defaults: { in_app: true, email: true, push: true },
  },
  // The team already sees new tickets in the "Chamados" badge; e-mail is the outside nudge.
  ticket_created: {
    audience: "staff",
    label: "Chamado novo",
    description: "Um lojista abriu um chamado.",
    defaults: { email: true },
  },
};

/** Whether the event goes out on the channel, given the person's saved choice (if any). */
export function channelEnabled(
  event: NotificationEventName,
  channel: NotificationChannelName,
  saved: boolean | undefined,
): boolean {
  const fallback = NOTIFICATION_EVENT_DEFINITIONS[event].defaults[channel];
  if (fallback === undefined) {
    return false;
  }
  return saved ?? fallback;
}

const FOOTNOTE = "Você recebe este aviso pelas suas preferências de notificação no Perfil.";

export interface SalePaidNotice {
  orderId: string;
  externalOrderId: string;
  totalCents: number;
  firstItemTitle: string | null;
  itemCount: number;
}

function soldWhat(sale: SalePaidNotice): string {
  if (sale.firstItemTitle === null) {
    return `o pedido ${sale.externalOrderId}`;
  }
  if (sale.itemCount <= 1) {
    return sale.firstItemTitle;
  }
  return `${sale.firstItemTitle} e mais ${sale.itemCount - 1} ${sale.itemCount === 2 ? "item" : "itens"}`;
}

export function salePaidContent(sale: SalePaidNotice): NotificationContent {
  const total = formatCents(sale.totalCents);
  return {
    subject: `Venda paga de ${total}`,
    preview: `Pedido ${sale.externalOrderId}: organize o pagamento ao fornecedor.`,
    heading: `Você vendeu ${soldWhat(sale)}`,
    paragraphs: [
      `O pedido ${sale.externalOrderId} foi pago: ${total}.`,
      "Organize seu pagamento ao fornecedor e encaminhe o pedido para ele separar e enviar.",
    ],
    actionLabel: "Ver pedido",
    actionPath: `/pedidos/${sale.orderId}`,
    footnote: FOOTNOTE,
  };
}

export interface OrderDeliveredNotice {
  orderId: string;
  externalOrderId: string;
}

export function orderDeliveredContent(order: OrderDeliveredNotice): NotificationContent {
  return {
    subject: `Pedido ${order.externalOrderId} entregue`,
    preview: "Avalie o fornecedor enquanto a entrega está fresca.",
    heading: "Pedido entregue",
    paragraphs: [
      `O comprador recebeu o pedido ${order.externalOrderId}.`,
      "Avalie o fornecedor: a sua nota forma o score dele.",
    ],
    actionLabel: "Ver pedido",
    actionPath: `/pedidos/${order.orderId}`,
    footnote: FOOTNOTE,
  };
}

export interface ShipmentLateNotice {
  orderId: string;
  externalOrderId: string;
  supplierName: string;
  delay: ShipmentDelay;
}

export function shipmentLateContent(late: ShipmentLateNotice): NotificationContent {
  const label = SHIPMENT_DELAY_LABELS[late.delay];
  return {
    subject: `${label}: pedido ${late.externalOrderId}`,
    preview: `Envio de ${late.supplierName}.`,
    heading: label,
    paragraphs: [
      `O envio de ${late.supplierName} do pedido ${late.externalOrderId} passou do prazo.`,
      "Fale com o fornecedor e acompanhe o rastreio para não perder a avaliação da venda.",
    ],
    actionLabel: "Ver pedido",
    actionPath: `/pedidos/${late.orderId}`,
    footnote: FOOTNOTE,
  };
}

export interface StoreExpiredNotice {
  storeName: string;
}

export function storeExpiredContent(store: StoreExpiredNotice): NotificationContent {
  return {
    subject: `${store.storeName} precisa ser reconectada`,
    preview: "Pedidos e estoque estão parados nesta loja.",
    heading: "Reconecte a sua loja",
    paragraphs: [
      `O acesso à loja ${store.storeName} expirou.`,
      "Enquanto ela não for reconectada, pedidos novos e estoque não são sincronizados.",
    ],
    actionLabel: "Reconectar loja",
    actionPath: "/lojas",
    footnote: FOOTNOTE,
  };
}

export interface ListingFailedNotice {
  listingTitle: string;
  reason: string | null;
}

export function listingFailedContent(listing: ListingFailedNotice): NotificationContent {
  return {
    subject: `Publicação recusada: ${listing.listingTitle}`,
    preview: listing.reason ?? "O marketplace recusou o anúncio.",
    heading: "Um anúncio não foi publicado",
    paragraphs: [
      `O marketplace recusou ${listing.listingTitle}.`,
      listing.reason ?? "Abra o anúncio para ver o motivo e tentar de novo.",
    ],
    actionLabel: "Ver publicações com erro",
    actionPath: "/publicacoes?status=error",
    footnote: FOOTNOTE,
  };
}

export interface SupportReplyNotice {
  ticketId: string;
  subject: string;
}

/** The reply itself is not copied into the e-mail: it may carry account details. */
export function supportReplyContent(reply: SupportReplyNotice): NotificationContent {
  return {
    subject: `Nova resposta no seu chamado: ${reply.subject}`,
    preview: "A equipe de suporte do SellBridge respondeu.",
    heading: "O suporte respondeu",
    paragraphs: [
      `A equipe de suporte do SellBridge respondeu ao seu chamado "${reply.subject}".`,
      "Leia a resposta e continue a conversa pelo app.",
    ],
    actionLabel: "Ler a resposta",
    actionPath: `/suporte/${reply.ticketId}`,
    footnote: FOOTNOTE,
  };
}

export interface NewTicketNotice {
  ticketId: string;
  subject: string;
  storeName: string;
  categoryLabel: string;
}

/** For the support team; the message itself stays in the app (it may carry account details). */
export function newTicketContent(ticket: NewTicketNotice): NotificationContent {
  return {
    subject: `Chamado novo: ${ticket.subject}`,
    preview: `${ticket.storeName} · ${ticket.categoryLabel}`,
    heading: "Chegou um chamado novo",
    paragraphs: [
      `${ticket.storeName} abriu um chamado sobre ${ticket.categoryLabel.toLowerCase()}: "${ticket.subject}".`,
      "Assuma o chamado na fila para o lojista saber que alguém está cuidando.",
    ],
    actionLabel: "Abrir o chamado",
    actionPath: `/admin/chamados/${ticket.ticketId}`,
    footnote: "Você recebe este aviso por fazer parte da equipe de suporte do SellBridge.",
  };
}

export interface OrderMessageNotice {
  orderId: string;
  externalOrderId: string;
}

/** The supplier wrote about an order. The text stays in the app, like support replies. */
export function orderMessageContent(notice: OrderMessageNotice): NotificationContent {
  return {
    subject: `Nova mensagem no pedido #${notice.externalOrderId}`,
    preview: "O fornecedor escreveu nas mensagens do pedido.",
    heading: "Você tem uma nova mensagem",
    paragraphs: [
      `O fornecedor escreveu nas mensagens do pedido #${notice.externalOrderId}.`,
      "Abra o pedido no SellBridge para ler e responder.",
    ],
    actionLabel: "Abrir o pedido",
    actionPath: `/pedidos/${notice.orderId}`,
    footnote: FOOTNOTE,
  };
}

export interface SupplierConversationNotice {
  ticketId: string;
  /** The conversation's heading ("O pedido está atrasado"): never what was written. */
  subject: string;
  /** Who is told: the supplier about a reseller's message, or the reseller about a reply. */
  recipient: "reseller" | "supplier";
  /** The store the conversation is about. */
  storeName: string;
}

/** A message between store and supplier. The text stays in the app: it may carry anything. */
export function supplierConversationContent(
  notice: SupplierConversationNotice,
): NotificationContent {
  const path = `/suporte/conversas/${notice.ticketId}`;
  if (notice.recipient === "supplier") {
    return {
      subject: `Mensagem de um revendedor: ${notice.subject}`,
      preview: `Loja ${notice.storeName}.`,
      heading: "Um revendedor escreveu para você",
      paragraphs: [
        `A loja ${notice.storeName} escreveu sobre "${notice.subject}".`,
        "Leia e responda pelo SellBridge, em Suporte, na aba Revendedores.",
      ],
      actionLabel: "Ler a mensagem",
      actionPath: path,
      footnote: FOOTNOTE,
    };
  }
  return {
    subject: `O fornecedor respondeu: ${notice.subject}`,
    preview: `Loja ${notice.storeName}.`,
    heading: "O fornecedor respondeu",
    paragraphs: [
      `O fornecedor da loja ${notice.storeName} respondeu sobre "${notice.subject}".`,
      "Leia a resposta e continue a conversa pelo SellBridge.",
    ],
    actionLabel: "Ler a resposta",
    actionPath: path,
    footnote: FOOTNOTE,
  };
}
