import { renderActionEmail, type RenderedEmail } from "./layout.ts";
import type { SendEmail } from "./mailer.ts";

const HOURS_PER_DAY = 24;

export interface SupplierOrderItem {
  title: string;
  sku: string;
  quantity: number;
}

/** What the supplier reads: the order, its items, both deadlines and where to act on it. */
export interface SupplierOrderEmailInput {
  externalOrderId: string;
  items: readonly SupplierOrderItem[];
  acceptWithinHours: number;
  dispatchWithinHours: number;
  /** The order in the supplier panel, or the order link for a supplier without a panel. */
  link: string;
  /** Whether the supplier works from its panel (then `link` is the panel address). */
  hasPanel: boolean;
}

/** The order on the supplier panel's Pedidos screen, searched by its number. */
export function supplierPanelOrderUrl(externalOrderId: string, appUrl: string): string {
  const url = new URL("/fornecedor/painel/pedidos", appUrl);
  url.searchParams.set("query", externalOrderId);
  return url.toString();
}

function inDays(hours: number): string {
  const days = hours / HOURS_PER_DAY;
  return `${days} ${days === 1 ? "dia" : "dias"}`;
}

function inHours(hours: number): string {
  return `${hours} ${hours === 1 ? "hora" : "horas"}`;
}

/**
 * Both deadlines in one unit, so they read side by side: days when both are whole days
 * ("1 dia", "3 dias"), hours otherwise ("12 horas" and "48 horas", not "12 horas" and "2 dias").
 */
function deadlineSentence(acceptWithinHours: number, dispatchWithinHours: number): string {
  const wholeDays =
    acceptWithinHours % HOURS_PER_DAY === 0 && dispatchWithinHours % HOURS_PER_DAY === 0;
  const format = wholeDays ? inDays : inHours;
  return `Prazos: aceite em até ${format(acceptWithinHours)} e despache em até ${format(dispatchWithinHours)}, contados a partir deste e-mail.`;
}

function itemLine(item: SupplierOrderItem): string {
  const sku = item.sku ? ` (${item.sku})` : "";
  return `${item.quantity} × ${item.title}${sku}`;
}

const PANEL_COPY = {
  where:
    "O endereço de entrega e o pedido completo estão no seu painel. Lá você aceita, separa e informa o envio.",
  actionLabel: "Abrir no painel",
  footnote:
    "Este endereço foi cadastrado para receber os pedidos dos seus produtos no SellBridge. Entre com a conta do seu painel para ver o pedido.",
};

const LINK_COPY = {
  where:
    "O endereço de entrega está no link, junto com o pedido completo. Por ele você aceita, separa e informa o envio.",
  invite:
    'Os pedidos vão passar a ficar só no painel do fornecedor. Abra o pedido e toque em "Criar meu acesso ao painel" para ver todos num lugar só.',
  actionLabel: "Abrir o pedido",
  footnote:
    "Este endereço foi cadastrado para receber os pedidos dos seus produtos no SellBridge. O link vale por 30 dias.",
};

/**
 * The e-mail that hands an order to its supplier. It carries no buyer data: name and address
 * stay behind the panel sign-in or the link, which expires, instead of sitting in a mailbox for
 * good. Titles come from the marketplace and are escaped by the layout.
 */
export function supplierOrderEmail(order: SupplierOrderEmailInput, appUrl: string): RenderedEmail {
  const where = order.hasPanel ? [PANEL_COPY.where] : [LINK_COPY.where, LINK_COPY.invite];
  const copy = order.hasPanel ? PANEL_COPY : LINK_COPY;
  return renderActionEmail(
    {
      subject: `Novo pedido #${order.externalOrderId} para separar`,
      preview: "Abra o pedido para aceitar e separar os itens.",
      heading: `Pedido #${order.externalOrderId} para separar`,
      paragraphs: [
        "Uma loja que vende seus produtos pelo SellBridge recebeu este pedido:",
        ...order.items.map(itemLine),
        deadlineSentence(order.acceptWithinHours, order.dispatchWithinHours),
        ...where,
      ],
      actionLabel: copy.actionLabel,
      actionUrl: order.link,
      footnote: copy.footnote,
    },
    appUrl,
  );
}

/** One parcel of a forwarded order and where (if anywhere) its supplier takes e-mail. */
export interface SupplierRecipient extends Omit<SupplierOrderEmailInput, "link"> {
  shipmentId: string;
  contactEmail: string | null;
}

export interface EmailSupplierLinksInput {
  recipients: readonly SupplierRecipient[];
  /** The token of each parcel's supplier link, just issued by the forward. */
  links: readonly { shipmentId: string; token: string }[];
  appUrl: string;
  send: SendEmail;
  /** Records a failed e-mail (history note, log); the forward itself stands. */
  onFailure: (shipmentId: string, error: unknown) => Promise<void>;
}

/** The panel for a supplier with one, else the parcel's link; null when there is neither. */
function supplierLinkOf(
  recipient: SupplierRecipient,
  token: string | undefined,
  appUrl: string,
): string | null {
  if (recipient.hasPanel) {
    return supplierPanelOrderUrl(recipient.externalOrderId, appUrl);
  }
  if (token === undefined) {
    return null;
  }
  return new URL(`/fornecedor/pedido/${token}`, appUrl).toString();
}

/**
 * E-mails each supplier that has an order e-mail where to act on its parcel (its panel, or the
 * parcel's link when it has no panel), one parcel at a time, so one failing address never keeps
 * the others from going out. Returns the parcels whose e-mail was sent.
 */
export async function emailSupplierLinks(input: EmailSupplierLinksInput): Promise<Set<string>> {
  const tokens = new Map(input.links.map((link) => [link.shipmentId, link.token]));
  const emailed = new Set<string>();
  for (const recipient of input.recipients) {
    const link = supplierLinkOf(recipient, tokens.get(recipient.shipmentId), input.appUrl);
    if (recipient.contactEmail === null || link === null) {
      continue;
    }
    try {
      await input.send({
        to: recipient.contactEmail,
        ...supplierOrderEmail({ ...recipient, link }, input.appUrl),
      });
      emailed.add(recipient.shipmentId);
    } catch (error) {
      await input.onFailure(recipient.shipmentId, error);
    }
  }
  return emailed;
}
