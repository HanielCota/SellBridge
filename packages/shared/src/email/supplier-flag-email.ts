import { renderActionEmail, type RenderedEmail } from "./layout.ts";
import {
  SUPPLIER_FLAG_LIMIT,
  SUPPLIER_FLAG_REASON_LABELS,
  supplierFlagCountLabel,
  type SupplierFlagReason,
} from "../domain/supplier-flags.ts";

const FOOTNOTE =
  "Você recebe este e-mail porque é o contato da sua marca na SellBridge. Se discordar, conteste pelo painel.";

export interface SupplierFlagEmailInput {
  reason: SupplierFlagReason;
  /** Active flags counting this one. */
  activeCount: number;
  /** True when this flag switched the account off. */
  deactivated: boolean;
  /** Whether the account is on after this flag: false when the team had already switched it off. */
  supplierActive: boolean;
  panelUrl: string;
}

/** What the flag means for the account: off already, one flag away, or the rule. */
function standingWarning(input: SupplierFlagEmailInput): string {
  if (!input.supplierActive) {
    return "Sua conta continua desligada.";
  }
  if (SUPPLIER_FLAG_LIMIT - input.activeCount === 1) {
    return "Falta 1 flag para a conta ser desligada.";
  }
  return `Na ${SUPPLIER_FLAG_LIMIT}ª flag a conta é desligada.`;
}

function flagParagraphs(input: SupplierFlagEmailInput): string[] {
  const reason = SUPPLIER_FLAG_REASON_LABELS[input.reason];
  const counter = `Flags ativas: ${supplierFlagCountLabel(input.activeCount)}.`;
  const warning = standingWarning(input);
  return [
    `A equipe SellBridge registrou uma flag na sua conta: ${reason}.`,
    `${counter} ${warning}`,
  ];
}

/**
 * Tells the brand's contact about a new flag, or that its 3rd flag switched the account off. It
 * names the reason only: the team's note and who applied it stay behind the login.
 */
export function supplierFlagEmail(input: SupplierFlagEmailInput, appUrl: string): RenderedEmail {
  if (input.deactivated) {
    return renderActionEmail(
      {
        subject: "Sua conta de fornecedor foi desligada",
        preview: "Seus produtos saíram do catálogo. Veja o que fazer no painel.",
        heading: "Sua conta de fornecedor foi desligada",
        paragraphs: [
          `A conta chegou a ${SUPPLIER_FLAG_LIMIT} flags. Seus produtos saíram do catálogo e os anúncios dos revendedores foram pausados.`,
          "Os pedidos que você já recebeu continuam no painel: entregue todos normalmente.",
          "Para pedir uma revisão, fale com o suporte pelo painel.",
        ],
        actionLabel: "Abrir o painel",
        actionUrl: input.panelUrl,
        footnote: FOOTNOTE,
      },
      appUrl,
    );
  }
  return renderActionEmail(
    {
      subject: `Nova flag na sua conta: ${SUPPLIER_FLAG_REASON_LABELS[input.reason]}`,
      preview: "Veja o motivo e a observação da equipe no painel.",
      heading: "Você recebeu uma flag",
      paragraphs: [...flagParagraphs(input), "Veja o motivo e a observação da equipe no painel."],
      actionLabel: "Ver no painel",
      actionUrl: input.panelUrl,
      footnote: FOOTNOTE,
    },
    appUrl,
  );
}
