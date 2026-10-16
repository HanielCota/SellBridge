import { renderActionEmail, type RenderedEmail } from "./layout.ts";
import type { SendEmail } from "./mailer.ts";

const HOURS_PER_DAY = 24;

export interface SupplierOrderItem {
  title: string;
  sku: string;
  quantity: number;
}

/** What the supplier reads: the order, its items, both deadlines and the link to act on it. */
export interface SupplierOrderEmailInput {
  externalOrderId: string;
  items: readonly SupplierOrderItem[];
  acceptWithinHours: number;
  dispatchWithinHours: number;
  link: string;
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

/**
 * The e-mail that hands an order to its supplier. It carries no buyer data: name and address
 * stay behind the link, which expires, instead of sitting in a mailbox for good. Titles come
 * from the marketplace and are escaped by the layout.
 */
export function supplierOrderEmail(order: SupplierOrderEmailInput, appUrl: string): RenderedEmail {
  return renderActionEmail(
    {
      subject: `Novo pedido #${order.externalOrderId} para separar`,
      preview: "Abra o pedido para aceitar e separar os itens.",
      heading: `Pedido #${order.externalOrderId} para separar`,
      paragraphs: [
        "Uma loja que vende seus produtos pelo SellBridge recebeu este pedido:",
        ...order.items.map(itemLine),
        deadlineSentence(order.acceptWithinHours, order.dispatchWithinHours),
        "O endereço de entrega está no link, junto com o pedido completo. Por ele você aceita, separa e informa o envio.",
      ],
      actionLabel: "Abrir o pedido",
      actionUrl: order.link,
      footnote:
        "Este endereço foi cadastrado para receber os pedidos dos seus produtos no SellBridge. O link vale por 30 dias.",
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

/**
 * E-mails each supplier that has an order e-mail its link, one parcel at a time, so one failing
 * address never keeps the others from going out. Returns the parcels whose e-mail was sent.
 */
export async function emailSupplierLinks(input: EmailSupplierLinksInput): Promise<Set<string>> {
  const tokens = new Map(input.links.map((link) => [link.shipmentId, link.token]));
  const emailed = new Set<string>();
  for (const recipient of input.recipients) {
    const token = tokens.get(recipient.shipmentId);
    if (recipient.contactEmail === null || token === undefined) {
      continue;
    }
    const link = new URL(`/fornecedor/pedido/${token}`, input.appUrl).toString();
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
