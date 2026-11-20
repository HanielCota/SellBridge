import { renderActionEmail, type RenderedEmail } from "@sellbridge/shared/email-layout";
import { SUPPLIER_INVITE_DAYS } from "./invite-token";

/**
 * The team's invite to a supplier that only ever used order links. It names the e-mail to use,
 * because only an account with the supplier's order e-mail may take the supplier.
 */
export function supplierInviteEmail(
  input: { supplierName: string; contactEmail: string; inviteUrl: string },
  appUrl: string,
): RenderedEmail {
  return renderActionEmail(
    {
      subject: `Ative o painel da ${input.supplierName} no SellBridge`,
      preview: "Os pedidos dos revendedores vão ficar só no painel do fornecedor.",
      heading: `Ative o painel da ${input.supplierName}`,
      paragraphs: [
        "Os pedidos dos revendedores vão passar a ficar só no painel do fornecedor do SellBridge. Lá você aceita, separa e informa o envio de todos os pedidos num lugar só.",
        `Crie a sua conta ou entre com este e-mail (${input.contactEmail}). Os seus produtos e pedidos já estarão lá.`,
      ],
      actionLabel: "Ativar meu painel",
      actionUrl: input.inviteUrl,
      footnote: `O convite vale ${SUPPLIER_INVITE_DAYS} dias. Se você não fornece produtos pelo SellBridge, ignore este e-mail.`,
    },
    appUrl,
  );
}
