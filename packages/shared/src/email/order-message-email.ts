import { renderActionEmail, renderNoticeEmail, type RenderedEmail } from "./layout.ts";

const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const FOOTNOTE =
  "Por segurança, o texto da mensagem não vai por e-mail: leia e responda pelo SellBridge.";

export interface SupplierOrderMessageInput {
  externalOrderId: string;
  /** When the order was forwarded: the date of the e-mail that carried the supplier link. */
  forwardedAt: Date;
  /** The supplier panel's order list, for a supplier with an account; null for link only. */
  panelUrl: string | null;
}

/**
 * Tells a supplier the store wrote about an order, without the message: the text stays behind
 * a login or the order link. A supplier without an account gets no new link (only its hash is
 * kept), so it is told which e-mail holds the one it already has.
 */
export function supplierOrderMessageEmail(
  input: SupplierOrderMessageInput,
  appUrl: string,
): RenderedEmail {
  const subject = `Nova mensagem no pedido #${input.externalOrderId}`;
  const heading = "Você tem uma nova mensagem";
  const first = `A loja escreveu uma mensagem sobre o pedido #${input.externalOrderId}.`;
  if (input.panelUrl === null) {
    return renderNoticeEmail(
      {
        subject,
        preview: "Abra o link do pedido para ler e responder.",
        heading,
        paragraphs: [
          first,
          `Abra o link do pedido que você recebeu por e-mail em ${DATE.format(input.forwardedAt)} para ler e responder.`,
        ],
        footnote: FOOTNOTE,
      },
      appUrl,
    );
  }
  return renderActionEmail(
    {
      subject,
      preview: "Entre no painel para ler e responder.",
      heading,
      paragraphs: [first, "Entre no painel do fornecedor para ler e responder."],
      actionLabel: "Abrir o pedido",
      actionUrl: input.panelUrl,
      footnote: FOOTNOTE,
    },
    appUrl,
  );
}
