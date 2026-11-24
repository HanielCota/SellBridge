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
  "shipment_problem",
  "invoice_authorized",
  "invoice_attention",
  "marketplace_claim",
  "store_buyer_address",
  "receiving_account_needed",
  "receiving_account_waiting",
  "store_order_message",
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
  // Both sides: the reseller answers the buyer, the supplier gets the parcel back or resends it.
  shipment_problem: {
    audience: "reseller",
    label: "Problema na entrega",
    description:
      "A transportadora não conseguiu entregar um pacote ou ele voltou. Para o fornecedor, também a venda cancelada antes do envio.",
    defaults: { in_app: true, email: true, push: true },
  },
  // E-mail only: it carries the note's files, which the bell cannot.
  invoice_authorized: {
    audience: "reseller",
    label: "Nota fiscal emitida",
    description: "O fornecedor emitiu a nota fiscal de um pacote. O XML e o DANFE vão no e-mail.",
    defaults: { email: true },
  },
  // For the supplier, in the bell and by e-mail.
  invoice_attention: {
    audience: "reseller",
    label: "Nota fiscal com problema",
    description: "A nota fiscal de um pacote parou e só sai depois que você corrigir.",
    defaults: { in_app: true, email: true },
  },
  // Both sides: the reseller answers the buyer on the marketplace, the supplier may get it back.
  marketplace_claim: {
    audience: "reseller",
    label: "Reclamação no marketplace",
    description: "Um comprador abriu uma reclamação ou devolução, ou ela mudou de etapa.",
    defaults: { in_app: true, email: true, push: true },
  },
  store_buyer_address: {
    audience: "reseller",
    label: "Suas compras indo para o fornecedor",
    description: "As compras pessoais da sua conta do marketplace estão indo para o fornecedor.",
    defaults: { in_app: true, email: true, push: true },
  },
  // For the supplier: a new parcel waits until its receiving account is approved.
  receiving_account_needed: {
    audience: "reseller",
    label: "Pedido esperando sua conta de recebimento",
    description: "Chegou um pedido que só segue depois que você ligar a conta de recebimento.",
    defaults: { in_app: true, email: true, push: true },
  },
  // The team also sees it in Problemas; e-mail is the outside nudge.
  receiving_account_waiting: {
    audience: "staff",
    label: "Pedido parado sem conta de recebimento",
    description: "Um pedido espera o fornecedor ligar a conta de recebimento.",
    defaults: { email: true },
  },
  // For the supplier with a panel: the other direction of `order_message`.
  store_order_message: {
    audience: "reseller",
    label: "Mensagem da loja num pedido",
    description: "Uma loja escreveu nas mensagens de um pedido seu.",
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
      "Avalie o fornecedor: a sua avaliação forma a nota dele.",
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

export interface ShipmentProblemNotice {
  orderId: string;
  externalOrderId: string;
  problem: "not_delivered" | "returned";
  /** The supplier's notice leads to its panel; the reseller's to the order. */
  recipient: "reseller" | "supplier";
}

const SHIPMENT_PROBLEM_HEADINGS: Record<ShipmentProblemNotice["problem"], string> = {
  not_delivered: "Pacote não entregue",
  returned: "Pacote devolvido",
};

/** What each side does now. A return follows the return policy: reason first, then the check. */
function shipmentProblemNextStep(notice: ShipmentProblemNotice): string {
  const forSupplier = notice.recipient === "supplier";
  if (notice.problem === "returned") {
    return forSupplier
      ? "Confira o produto e responda a devolução no Suporte dentro do prazo. Sem resposta, vale o que o revendedor contar."
      : "Abra o pedido e conte ao fornecedor por que o comprador devolveu.";
  }
  return forSupplier
    ? "Confira o rastreio e combine com o revendedor o que fazer com o pacote."
    : "Fale com o comprador pelo chat da venda e acompanhe o rastreio.";
}

export function shipmentProblemContent(notice: ShipmentProblemNotice): NotificationContent {
  const heading = SHIPMENT_PROBLEM_HEADINGS[notice.problem];
  const forSupplier = notice.recipient === "supplier";
  return {
    subject: `${heading}: pedido ${notice.externalOrderId}`,
    preview: forSupplier
      ? "Veja o rastreio no seu painel."
      : "Avise o comprador e acompanhe o rastreio.",
    heading,
    paragraphs: [
      notice.problem === "not_delivered"
        ? `A transportadora não conseguiu entregar o pedido ${notice.externalOrderId}.`
        : `O pedido ${notice.externalOrderId} voltou para o remetente.`,
      shipmentProblemNextStep(notice),
    ],
    actionLabel: forSupplier ? "Ver no painel" : "Ver pedido",
    actionPath: forSupplier ? "/fornecedor/painel/pedidos" : `/pedidos/${notice.orderId}`,
    footnote: FOOTNOTE,
  };
}

export interface SaleCancelledNotice {
  externalOrderId: string;
  /** Where the sale was cancelled ("no Mercado Livre", "na Shopee"), or null when unnamed. */
  channelPlace: string | null;
}

/** For the supplier: the sale of a parcel in its queue was cancelled, so it must not ship it. */
export function saleCancelledContent(notice: SaleCancelledNotice): NotificationContent {
  const where = notice.channelPlace === null ? "" : ` ${notice.channelPlace}`;
  return {
    subject: `Venda cancelada, não envie: pedido ${notice.externalOrderId}`,
    preview: "O pedido passou para Encerrados.",
    heading: "Venda cancelada: não envie",
    paragraphs: [
      `O pedido ${notice.externalOrderId} foi cancelado${where} e passou para Encerrados. O prazo dele não conta mais.`,
      "Não envie o produto. Se você já separou, devolva ao estoque.",
    ],
    actionLabel: "Ver no painel",
    actionPath: "/fornecedor/painel/pedidos?tab=closed",
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
      "Enquanto você não reconectar, pedidos novos não chegam e o estoque não atualiza.",
    ],
    actionLabel: "Reconectar loja",
    actionPath: "/lojas",
    footnote: FOOTNOTE,
  };
}

export interface StoreBuyerAddressNotice {
  storeName: string;
  supplierName: string;
}

export function storeBuyerAddressContent(notice: StoreBuyerAddressNotice): NotificationContent {
  return {
    subject: `${notice.storeName}: suas compras estão indo para o fornecedor`,
    preview: "Troque o endereço de compra no Mercado Livre para voltar a publicar.",
    heading: "Arrume o endereço de compra da loja",
    paragraphs: [
      `O endereço de compra da conta da loja ${notice.storeName} no Mercado Livre é o de ${notice.supplierName}. As suas compras pessoais vão chegar no fornecedor.`,
      "No Mercado Livre, deixe a sua casa como endereço de compra. O endereço do fornecedor fica só para envio e devolução.",
      "Até lá, a loja continua vendendo, mas não publica produtos novos.",
    ],
    actionLabel: "Ver como arrumar",
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

export interface StoreOrderMessageNotice {
  externalOrderId: string;
  /** The Pedidos tab that lists the parcel, so the link opens where it is. */
  supplierTab: string;
}

/** For the supplier with a panel: a store wrote about an order. The text stays in the app. */
export function storeOrderMessageContent(notice: StoreOrderMessageNotice): NotificationContent {
  const search = new URLSearchParams({ tab: notice.supplierTab, query: notice.externalOrderId });
  return {
    subject: `Nova mensagem no pedido #${notice.externalOrderId}`,
    preview: "A loja escreveu nas mensagens do pedido.",
    heading: "Você tem uma nova mensagem",
    paragraphs: [
      `A loja que vendeu o pedido #${notice.externalOrderId} escreveu nas mensagens dele.`,
      "Abra o pedido no seu painel do SellBridge para ler e responder.",
    ],
    actionLabel: "Abrir o pedido",
    actionPath: `/fornecedor/painel/pedidos?${search.toString()}`,
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

export interface InvoiceAuthorizedNotice {
  orderId: string;
  shipmentId: string;
  externalOrderId: string;
  supplierName: string;
  invoiceNumber: string;
}

/** The note's files go attached; the order page keeps them for a later download. */
export function invoiceAuthorizedContent(notice: InvoiceAuthorizedNotice): NotificationContent {
  return {
    subject: `Nota fiscal do pedido #${notice.externalOrderId}`,
    preview: `Nota ${notice.invoiceNumber} emitida por ${notice.supplierName}.`,
    heading: "A nota fiscal foi emitida",
    paragraphs: [
      `${notice.supplierName} emitiu a nota fiscal ${notice.invoiceNumber} do pedido #${notice.externalOrderId}, direto para o comprador.`,
      "O XML e o DANFE (PDF) da nota também ficam no pedido, para baixar quando precisar.",
    ],
    actionLabel: "Abrir o pedido",
    actionPath: `/pedidos/${notice.orderId}`,
    footnote: FOOTNOTE,
    invoiceShipmentId: notice.shipmentId,
  };
}

export interface InvoiceAttentionNotice {
  externalOrderId: string;
}

/**
 * For the supplier: the note stopped and waits for them. The reason stays in the panel, since a
 * refusal from the ERP may quote the buyer's details.
 */
export function invoiceAttentionContent(notice: InvoiceAttentionNotice): NotificationContent {
  return {
    subject: `Nota fiscal com problema: pedido #${notice.externalOrderId}`,
    preview: "A nota não saiu. Veja no painel o que corrigir.",
    heading: "A nota fiscal não saiu",
    paragraphs: [
      `A nota fiscal do pedido #${notice.externalOrderId} parou e não vai sair sozinha.`,
      "Abra o pedido no seu painel, na aba Com problema: lá diz o que corrigir. Depois, toque em Tentar de novo.",
    ],
    actionLabel: "Ver no painel",
    actionPath: "/fornecedor/painel/pedidos?tab=problem",
    footnote: FOOTNOTE,
  };
}

/** When a buyer's claim is worth a notice: it opened, the marketplace took it over, or it ended. */
export type ClaimNoticeMoment = "opened" | "mediation" | "closed";

export interface ClaimNotice {
  orderId: string;
  externalOrderId: string;
  moment: ClaimNoticeMoment;
  /** The reseller answers the buyer; the supplier only follows (and may get the parcel back). */
  recipient: "reseller" | "supplier";
  /** The supplier's orders tab that holds the parcel, so the link lands on it. */
  supplierTab?: string;
}

const CLAIM_HEADINGS: Record<ClaimNoticeMoment, string> = {
  opened: "Reclamação aberta no Mercado Livre",
  mediation: "O Mercado Livre está mediando a reclamação",
  closed: "Reclamação encerrada",
};

function claimFacts(notice: ClaimNotice): string {
  const order = notice.externalOrderId;
  if (notice.moment === "opened") {
    return `O comprador do pedido ${order} abriu uma reclamação no Mercado Livre.`;
  }
  if (notice.moment === "mediation") {
    return `A reclamação do pedido ${order} passou para a mediação do Mercado Livre.`;
  }
  return `A reclamação do pedido ${order} foi encerrada no Mercado Livre.`;
}

function claimNextStep(notice: ClaimNotice): string {
  if (notice.recipient === "supplier") {
    return notice.moment === "closed"
      ? "Veja no pedido como ela terminou."
      : "O revendedor responde ao comprador. Veja no pedido o motivo e se há devolução.";
  }
  return notice.moment === "closed"
    ? "Veja no pedido como ela terminou e se houve devolução."
    : "Responda pelo Mercado Livre dentro do prazo para não perder a venda nem reputação.";
}

export function claimNoticeContent(notice: ClaimNotice): NotificationContent {
  const heading = CLAIM_HEADINGS[notice.moment];
  const forSupplier = notice.recipient === "supplier";
  return {
    subject: `${heading}: pedido ${notice.externalOrderId}`,
    preview: claimNextStep(notice),
    heading,
    paragraphs: [claimFacts(notice), claimNextStep(notice)],
    actionLabel: forSupplier ? "Ver no painel" : "Ver pedido",
    actionPath: forSupplier
      ? `/fornecedor/painel/pedidos?${new URLSearchParams({ tab: notice.supplierTab ?? "todo", query: notice.externalOrderId }).toString()}`
      : `/pedidos/${notice.orderId}`,
    footnote: FOOTNOTE,
  };
}

export interface ReceivingAccountWaitNotice {
  externalOrderId: string;
  supplierName: string;
}

/** For the supplier: a new parcel waits for its receiving account. */
export function receivingAccountNeededContent(
  notice: ReceivingAccountWaitNotice,
): NotificationContent {
  return {
    subject: `Pedido ${notice.externalOrderId} esperando sua conta de recebimento`,
    preview: "Ligue a conta no Asaas para aceitar o pedido.",
    heading: "Ligue sua conta de recebimento",
    paragraphs: [
      `O pedido ${notice.externalOrderId} chegou, mas só segue depois que sua conta de recebimento no Asaas for aprovada.`,
      "Abra Recebimentos no seu painel, abra a conta e envie os documentos. O revendedor paga você por ela.",
    ],
    actionLabel: "Ligar minha conta",
    actionPath: "/fornecedor/painel/recebimentos",
    footnote: FOOTNOTE,
  };
}

/** For the team: a parcel waits for its supplier's receiving account. */
export function receivingAccountWaitingContent(
  notice: ReceivingAccountWaitNotice,
): NotificationContent {
  return {
    subject: `Pedido ${notice.externalOrderId} parado: ${notice.supplierName} sem conta de recebimento`,
    preview: "O pedido só segue depois que o fornecedor ligar a conta.",
    heading: "Pedido parado sem conta de recebimento",
    paragraphs: [
      `O pedido ${notice.externalOrderId} espera ${notice.supplierName} ligar a conta de recebimento no Asaas. O fornecedor já foi avisado.`,
      "Se ele não ligar logo, fale com ele: o prazo de postagem do marketplace continua correndo.",
    ],
    actionLabel: "Ver em Problemas",
    actionPath: "/admin/problemas",
    footnote: FOOTNOTE,
  };
}
