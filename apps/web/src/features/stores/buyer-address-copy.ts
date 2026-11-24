import { formatCep } from "@sellbridge/shared/billing-address";
import type { BuyerAddressResult } from "@sellbridge/shared/buyer-address";
import { OTHER_SITUATION_ID } from "@sellbridge/shared/support-topics";
import type { StatusTone } from "@/components/data/tone-status";

/** A store's last check, as the stores page receives it. */
export interface BuyerAddressNoticeInput {
  result: BuyerAddressResult;
  supplierName: string | null;
  supplierPlace: { street: string; number: string; zipCode: string } | null;
  releasedAt: Date | null;
  releaseNote: string | null;
}

/** What a store's purchase address notice says; kept apart from the component to test it alone. */
export interface BuyerAddressNoticeCopy {
  tone: Extract<StatusTone, "danger" | "warning" | "muted">;
  /** The status pill: what is wrong, in the reseller's words. */
  label: string;
  /** What happens because of it. */
  paragraphs: readonly string[];
  /** The address to change, as the reseller will find it on Mercado Livre; null when unknown. */
  wrongAddress: string | null;
  /** How to fix it on Mercado Livre, one step per line. */
  steps: readonly string[];
  /** The button that reads the account again; null when there is nothing left to do. */
  actionLabel: string | null;
  /** Whether a held reseller may ask the team to release a false alarm. */
  offersFalseAlarm: boolean;
}

const FIXED = "Já arrumei, conferir de novo";

const OPEN_ADDRESSES = "No Mercado Livre, abra Meus dados › Endereços.";
const MARK_HOME =
  "Escolha o endereço da sua casa (ou cadastre-o) e marque-o como endereço de compra.";
const COME_BACK = `Volte aqui e toque em “${FIXED}”.`;

function supplierAddressLine(place: BuyerAddressNoticeInput["supplierPlace"]): string | null {
  if (place === null) {
    return null;
  }
  return `${place.street}, ${place.number} · CEP ${formatCep(place.zipCode)}`;
}

function heldCopy(check: BuyerAddressNoticeInput): BuyerAddressNoticeCopy {
  const supplier = check.supplierName ?? "o fornecedor";
  const destination = check.supplierName === null ? "no fornecedor" : `em ${check.supplierName}`;
  return {
    tone: "danger",
    label: "Compras indo para o fornecedor",
    paragraphs: [
      `O endereço de compra desta conta do Mercado Livre é o de ${supplier}: as suas compras pessoais vão chegar ${destination}.`,
      "Até você trocar, a loja continua vendendo, mas não publica produtos novos.",
    ],
    wrongAddress: supplierAddressLine(check.supplierPlace),
    steps: [
      OPEN_ADDRESSES,
      MARK_HOME,
      `Deixe o endereço de ${supplier} só para envio e devolução.`,
      COME_BACK,
    ],
    actionLabel: FIXED,
    offersFalseAlarm: true,
  };
}

function releasedCopy(check: BuyerAddressNoticeInput): BuyerAddressNoticeCopy {
  const reason = check.releaseNote === null ? "" : ` Motivo: ${check.releaseNote}`;
  return {
    tone: "muted",
    label: "Liberada pela equipe",
    paragraphs: [
      `O endereço de compra parece o de ${check.supplierName ?? "um fornecedor"}, mas a equipe conferiu e liberou esta loja para publicar.${reason}`,
    ],
    wrongAddress: null,
    steps: [],
    actionLabel: null,
    offersFalseAlarm: false,
  };
}

/** Null when there is nothing to tell: the address is fine, or the store was never checked. */
export function buyerAddressNoticeCopy(
  check: BuyerAddressNoticeInput | null,
): BuyerAddressNoticeCopy | null {
  if (check === null) {
    return null;
  }
  if (check.result === "supplier_address") {
    return check.releasedAt === null ? heldCopy(check) : releasedCopy(check);
  }
  if (check.result === "shipping_address") {
    return {
      tone: "warning",
      label: "Confira o endereço de compra",
      paragraphs: [
        "O endereço de compra desta conta é o mesmo de onde saem os envios. Se os envios saem do fornecedor, as suas compras vão para ele.",
      ],
      wrongAddress: null,
      steps: [
        OPEN_ADDRESSES,
        MARK_HOME,
        "Deixe o endereço de onde saem os envios só para envio e devolução.",
        COME_BACK,
      ],
      actionLabel: FIXED,
      offersFalseAlarm: false,
    };
  }
  if (check.result === "no_buying_address") {
    return {
      tone: "warning",
      label: "Sem endereço de compra",
      paragraphs: ["Esta conta não tem um endereço de compra marcado."],
      wrongAddress: null,
      steps: [OPEN_ADDRESSES, MARK_HOME, COME_BACK],
      actionLabel: FIXED,
      offersFalseAlarm: false,
    };
  }
  if (check.result === "not_checked") {
    return {
      tone: "muted",
      label: "Endereço de compra não conferido",
      paragraphs: [
        "Não conseguimos ler os endereços desta conta no Mercado Livre. Tentamos de novo todo dia, ou confira agora.",
      ],
      wrongAddress: null,
      steps: [],
      actionLabel: "Conferir agora",
      offersFalseAlarm: false,
    };
  }
  return null;
}

/** The new support ticket a held reseller opens to ask for a false alarm to be released. */
export function falseAlarmTicketSearch(storeConnectionId: string, supplierName: string | null) {
  const supplier = supplierName ?? "do fornecedor";
  // Topic and situation already picked: the reseller lands on the text, filled in to edit.
  return {
    categoria: "store" as const,
    situacao: OTHER_SITUATION_ID,
    loja: storeConnectionId,
    assunto: "Liberar loja: endereço de compra não é o do fornecedor",
    texto: `O SellBridge diz que o meu endereço de compra é o de ${supplier}, mas não é. Explique aqui o motivo (exemplo: moro no mesmo prédio).`,
  };
}

export interface RecheckOutcomeCopy {
  kind: "success" | "warning" | "error";
  title: string;
  description?: string;
}

/** The toast after "Já arrumei, conferir de novo". */
export function recheckOutcomeCopy(result: BuyerAddressResult): RecheckOutcomeCopy {
  if (result === "supplier_address") {
    return {
      kind: "error",
      title: "Ainda está no endereço do fornecedor",
      description: "Troque o endereço de compra no Mercado Livre e confira de novo.",
    };
  }
  if (result === "not_checked") {
    return {
      kind: "warning",
      title: "Não deu para conferir agora",
      description: "O Mercado Livre não respondeu. Tente de novo em alguns minutos.",
    };
  }
  if (result === "ok") {
    return {
      kind: "success",
      title: "Endereço de compra certo",
      description: "A loja pode publicar.",
    };
  }
  return {
    kind: "warning",
    title: "Conferido",
    description: "A loja pode publicar, mas veja o aviso no cartão dela.",
  };
}
